import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from neo4j import AsyncSession
from pydantic import BaseModel, Field, field_validator

from graphiti_core.nodes import EpisodeType
from graphiti_core.search.search_config_recipes import (
    COMBINED_HYBRID_SEARCH_CROSS_ENCODER,
)
from graphiti_core.search.search_filters import SearchFilters

from graphiti_client import close_graphiti, get_graphiti

logger = logging.getLogger("python-server")

# 保存原始类并替换
_original_extracted_entities = None
_original_extracted_entity = None

def _apply_field_compatibility_patch():
    """修改 ExtractedEntities 和 ExtractedEntity 类，让它们兼容字段不匹配的问题"""
    global _original_extracted_entities, _original_extracted_entity
    if _original_extracted_entities is not None and _original_extracted_entity is not None:
        return

    try:
        from graphiti_core.prompts.extract_nodes import ExtractedEntities, ExtractedEntity
        _original_extracted_entities = ExtractedEntities
        _original_extracted_entity = ExtractedEntity

        # 首先修改 ExtractedEntity 类，让它兼容 entity_text 字段作为 name
        class CompatibleExtractedEntity(_original_extracted_entity):
            name: str = Field(..., description='Name of the extracted entity')
            entity_type_id: int = Field(default=0, description='ID of the classified entity type')

            @field_validator('name', mode='before')
            @classmethod
            def validate_name_compatibility(cls, v: Any, info: Any) -> Any:
                # 从 info.data 中获取所有可用数据
                data = info.data if hasattr(info, 'data') else {}
                # 如果 name 字段缺失，检查是否有 entity_text 字段
                if v is None or v == "":
                    if 'entity_text' in data:
                        logger.warning("Applied patch: using 'entity_text' as 'name'")
                        return data['entity_text']
                return v

            model_config = {
                'extra': 'allow'
            }

        # 然后修改 ExtractedEntities 类，让它同时兼容 'entities' 和 'extracted_entities'
        class CompatibleExtractedEntities(_original_extracted_entities):
            extracted_entities: list[CompatibleExtractedEntity] = Field(..., description='List of extracted entities')

            @field_validator('extracted_entities', mode='before')
            @classmethod
            def validate_entities_compatibility(cls, v: Any, info: Any) -> Any:
                # 如果是字典，检查是否有 'entities' 字段
                if isinstance(v, dict):
                    if 'entities' in v and 'extracted_entities' not in v:
                        logger.warning("Applied patch: using 'entities' as 'extracted_entities'")
                        return v['entities']
                    if 'extracted_entities' in v:
                        v = v['extracted_entities']
                # 如果是列表，检查每个元素是否需要字段转换
                if isinstance(v, list):
                    return [
                        {
                            'name': item.get('entity_text', item.get('name', '')),
                            'entity_type_id': item.get('entity_type_id', item.get('type', 0)),
                            **{k: val for k, val in item.items() if k not in ['entity_text']}
                        }
                        for item in v
                    ]
                return v

            model_config = {
                'extra': 'allow'
            }

        # 替换原始类
        import graphiti_core.prompts.extract_nodes as prompts_extract_nodes
        import graphiti_core.utils.maintenance.node_operations as node_operations

        sys.modules['graphiti_core.prompts.extract_nodes'].ExtractedEntity = CompatibleExtractedEntity
        sys.modules['graphiti_core.prompts.extract_nodes'].ExtractedEntities = CompatibleExtractedEntities
        sys.modules['graphiti_core.utils.maintenance.node_operations'].ExtractedEntity = CompatibleExtractedEntity
        sys.modules['graphiti_core.utils.maintenance.node_operations'].ExtractedEntities = CompatibleExtractedEntities

        prompts_extract_nodes.ExtractedEntity = CompatibleExtractedEntity
        prompts_extract_nodes.ExtractedEntities = CompatibleExtractedEntities
        node_operations.ExtractedEntity = CompatibleExtractedEntity
        node_operations.ExtractedEntities = CompatibleExtractedEntities

        logger.info("Applied Graphiti patch: ExtractedEntities and ExtractedEntity compatibility patch applied")

    except Exception as e:
        logger.warning(f"Failed to apply ExtractedEntities/ExtractedEntity patch: {e}")
        import traceback
        logger.warning(traceback.format_exc())

_apply_field_compatibility_patch()

logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logging.getLogger("neo4j.notifications").setLevel(logging.WARNING)

SELF_CANONICAL_NAME = "ゆいじゅ"
SELF_NAME_ALIASES = {"悠酱", "悠醬", "yuiju", SELF_CANONICAL_NAME}
CUSTOM_NODE_LABELS = ("Character", "PreferenceTarget")

# Search 结果的最小可接受分数阈值。
# 说明：
# - edge 是显式事实边，语义强，允许更低阈值以保留有效召回；
# - node_summary 是节点画像兜底，噪声更高，因此阈值更严格；
# - 这些值先用于清理明显无关结果，后续可基于真实日志继续微调。
EDGE_RESULT_MIN_SCORE = 0.2
NODE_SUMMARY_RESULT_MIN_SCORE = 0.15


class Character(BaseModel):
  """
  图谱中的角色实体。

  说明：
  - 只表示稳定可识别的人物/角色，不包含泛化事件或抽象流程；
  - 当前主要覆盖悠酱本人以及对话对象等具名角色。
  """

  character_role: Literal["self", "counterparty", "other"] | None = Field(
    default=None,
    description="角色在当前 episode 中的身份：self 为悠酱本人，counterparty 为互动对象，other 为其他角色。",
  )


class PreferenceTarget(BaseModel):
  """
  可承载长期偏好的目标实体。

  说明：
  - 用于表示食物、饮品、地点、活动、媒体等被偏好或回避的对象；
  - 不用于表示单次事件、计划或流程性动作。
  """

  target_kind: Literal["food", "drink", "activity", "place", "media", "topic", "other"] | None = (
    Field(
      default=None,
      description="偏好目标的粗粒度类别，例如 food、drink、activity、place、media、topic、other。",
    )
  )


class PreferenceEdge(BaseModel):
  """
  角色到偏好目标的长期偏好关系。
  """

  predicate: Literal["likes", "dislikes", "prefers", "avoids"] | None = Field(
    default=None,
    description="长期偏好关系的谓词，只能是 likes、dislikes、prefers、avoids。",
  )
  confidence: float | None = Field(
    default=None,
    ge=0,
    le=1,
    description="当前关系抽取的置信度，范围为 0 到 1。",
  )
  evidence_episode_id: str | None = Field(
    default=None,
    description="支撑当前关系的 Mongo memory episode id，应优先复用输入 meta 中的 episode_id。",
  )


class RelationEdge(BaseModel):
  """
  角色之间的稳定关系或长期态度。
  """

  predicate: Literal["trusts", "relies_on", "avoids", "attitude_towards"] | None = Field(
    default=None,
    description="人物关系谓词，只能是 trusts、relies_on、avoids、attitude_towards。",
  )
  confidence: float | None = Field(
    default=None,
    ge=0,
    le=1,
    description="当前关系抽取的置信度，范围为 0 到 1。",
  )
  evidence_episode_id: str | None = Field(
    default=None,
    description="支撑当前关系的 Mongo memory episode id，应优先复用输入 meta 中的 episode_id。",
  )


GRAPHITI_ENTITY_TYPES = {
  "Character": Character,
  "PreferenceTarget": PreferenceTarget,
}

GRAPHITI_EDGE_TYPES = {
  "PreferenceEdge": PreferenceEdge,
  "RelationEdge": RelationEdge,
}

GRAPHITI_EDGE_TYPE_MAP = {
  ("Character", "PreferenceTarget"): ["PreferenceEdge"],
  ("Character", "Character"): ["RelationEdge"],
}

GRAPHITI_EXCLUDED_ENTITY_TYPES = ["Entity"]

GRAPHITI_CUSTOM_EXTRACTION_INSTRUCTIONS = """
你正在为长期记忆图谱抽取实体和关系，只允许输出以下内容：
1. Character：稳定可识别的人物或角色，例如ゆいじゅ本人、明确具名的对话对象。
2. PreferenceTarget：可被长期喜欢/讨厌/偏好/回避的对象，例如食物、饮品、地点、活动、媒体、主题。
3. PreferenceEdge：Character -> PreferenceTarget 的长期偏好关系。
4. RelationEdge：Character -> Character 的稳定关系或长期态度。

必须遵守：
- 主角本人只能使用 `ゆいじゅ` 作为 Character 名称，不要生成 `悠酱` 或其他别名。
- 如果当前 episode 只描述单次行为、一次性消费、寒暄、天气、计划、金币变化、执行细节，返回空结果。
- 只有当文本明确体现“稳定偏好”或“稳定关系变化”时，才允许抽取关系。
- 如果文本明确出现“长期喜欢 / 总会优先选择 / 基本不会改 / 首选 / 最让我安心”这类稳定偏好信号，必须创建 Character -> PreferenceTarget 的 PreferenceEdge，不能只把偏好信息写进 Character summary。
- 对于“甜品长期最偏爱霜莓千层蛋糕”“饮料总会先选柚香热红茶”这类表达，应该形成 Character -> PreferenceTarget 的偏好边。
- 不要创建任何泛化实体，不要把事件、计划、流程、时间片当成实体。
- 如果拿不准是否具有长期价值，宁可不抽取。
- 如果输入 meta 中提供了 episode_id，请优先把它复制到 PreferenceEdge / RelationEdge 的 evidence_episode_id 字段。
""".strip()


class GraphitiEpisodePayload(BaseModel):
  """
  通过 TS 准入判断后的 Episode。

  说明：
  - TS 侧只负责 shouldWrite 的二值判断；
  - Python 侧基于该 episode 构造受控文本，并交给 Graphiti 的自定义 ontology 做抽取。
  """

  id: str | None = None
  source: str = Field(min_length=1)
  type: str = Field(min_length=1)
  subject: str = Field(min_length=1)
  counterparty: str | None = None
  happenedAt: datetime
  summaryText: str = Field(min_length=1)
  payload: dict[str, Any] = Field(default_factory=dict)


class EpisodeWriteRequest(BaseModel):
  is_dev: bool = Field(default=False)
  episode: GraphitiEpisodePayload


class EpisodeWriteResponse(BaseModel):
  memory_ids: list[str]


class MemorySearchRequest(BaseModel):
  """
  记忆检索入参。

  filters 为可选的 Graphiti SearchFilters 原始字典（首期不要求必须传）。
  """

  query: str = Field(min_length=1)
  counterparty_name: str | None = Field(default=None)
  is_dev: bool = Field(default=False)
  top_k: int = Field(default=5, ge=1, le=50)
  filters: dict[str, Any] | None = None


class MemorySearchItem(BaseModel):
  memory: str
  time: str | None = None
  source: str | None = None
  # 仅当存在可信 rerank 分数时返回。
  # None 表示当前结果只是保留了候选顺序，没有可用的绝对相关度分数。
  score: float | None = None
  validFrom: str | None = None
  validTo: str | None = None
  metadata: dict[str, Any] | None = None


class ClearDevResponse(BaseModel):
  deleted_count: int


app = FastAPI(title="python-server")


@app.on_event("shutdown")
async def _shutdown() -> None:
  await close_graphiti()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}


def _namespace_group_id(is_dev: bool) -> str:
  return "dev" if is_dev else "prod"


def _canonicalize_character_name(name: str | None, *, is_subject: bool = False) -> str | None:
  """
  统一图谱中的角色命名。

  说明：
  - 主角本人始终收敛为 `ゆいじゅ`，避免 `悠酱` / `ゆいじゅ` 混用导致重复节点与召回漂移；
  - 非主角名称默认保持原样，仅做首尾空白清理。
  """

  if is_subject:
    return SELF_CANONICAL_NAME

  normalized = (name or "").strip()
  if not normalized:
    return None

  if normalized in SELF_NAME_ALIASES:
    return SELF_CANONICAL_NAME

  return normalized


def _canonicalize_memory_text(text: str) -> str:
  """
  统一写入 Graphiti 的文本中的主角别名。

  说明：
  - 仅将主角别名替换为 `ゆいじゅ`，避免 summaryText 中再次引入重复 self 节点；
  - 其他人物名称不做重写，保持原始语义。
  """

  normalized = text
  for alias in SELF_NAME_ALIASES:
    if alias == SELF_CANONICAL_NAME:
      continue
    normalized = normalized.replace(alias, SELF_CANONICAL_NAME)
  return normalized


def _build_episode_payload_context(episode: GraphitiEpisodePayload) -> dict[str, Any]:
  """
  收敛送给 Graphiti 的 episode payload。

  说明：
  - 输入文本越受控，Graphiti 越不容易把日常流水误抽成实体或关系；
  - conversation 只保留少量最近消息，behavior 只保留动作级上下文。
  """

  payload = dict(episode.payload or {})

  if episode.type == "behavior":
    return {
      "action": payload.get("action"),
      "reason": payload.get("reason"),
      "executionResult": payload.get("executionResult"),
      "location": payload.get("location"),
    }

  if episode.type == "conversation":
    raw_messages = payload.get("messages")
    recent_messages: list[dict[str, str]] = []

    if isinstance(raw_messages, list):
      for item in raw_messages[-6:]:
        if not isinstance(item, dict):
          continue
        speaker_name = item.get("speaker_name")
        content = item.get("content")
        recent_messages.append(
          {
            "speaker_name": _canonicalize_character_name(str(speaker_name or "")) or "",
            "content": str(content or ""),
          }
        )

    return {
      "counterpartyName": _canonicalize_character_name(str(payload.get("counterpartyName") or "")),
      "recentMessages": recent_messages,
    }

  return payload


def _stringify_episode_content(
  episode: GraphitiEpisodePayload,
) -> str:
  """
  将准入后的 episode 转换为 Graphiti 可检索文本。

  当前约束说明：
  - 不直接发送完整原始 payload，减少 Graphiti 因噪声而创建泛化实体/关系的概率；
  - 通过 meta + 结构化上下文，把“谁、在什么场景下、说了什么/做了什么”保留下来；
  - 长期价值判断已由 TS 侧做过一次保守准入，这里继续强调 preference / relation 两类目标。
  """

  meta = {
    "episode_id": episode.id,
    "episode_type": episode.type,
    "episode_source": episode.source,
    "subject_name": _canonicalize_character_name(episode.subject, is_subject=True),
    "counterparty_name": _canonicalize_character_name(episode.counterparty),
    "happened_at": episode.happenedAt.astimezone(timezone.utc).isoformat(),
  }

  content = {
    "summaryText": _canonicalize_memory_text(episode.summaryText),
    "payloadContext": _build_episode_payload_context(episode),
  }

  return "\n".join(
    [
      "任务：只抽取稳定偏好与稳定人物关系；没有就返回空结果。",
      f"主角固定名称：{SELF_CANONICAL_NAME}。不要生成“悠酱”等别名实体。",
      "稳定偏好必须产出 PreferenceEdge，不能只写进节点 summary。",
      "[meta]",
      json.dumps(meta, ensure_ascii=False, separators=(",", ":")),
      "[/meta]",
      "[content]",
      json.dumps(content, ensure_ascii=False, separators=(",", ":")),
      "[/content]",
    ]
  )


@app.post("/v1/episodes", response_model=EpisodeWriteResponse)
async def write_episode(payload: EpisodeWriteRequest) -> EpisodeWriteResponse:
  graphiti = await get_graphiti()
  episode = payload.episode
  happened_at = episode.happenedAt

  if happened_at.tzinfo is None:
    happened_at = happened_at.replace(tzinfo=timezone.utc)

  result = await graphiti.add_episode(
    name=f"{episode.subject}-{episode.type}-{episode.id or happened_at.isoformat()}",
    episode_body=_stringify_episode_content(episode),
    source_description=f"episode:{episode.type}",
    reference_time=happened_at,
    source=EpisodeType.text,
    group_id=_namespace_group_id(payload.is_dev),
    entity_types=GRAPHITI_ENTITY_TYPES,
    excluded_entity_types=GRAPHITI_EXCLUDED_ENTITY_TYPES,
    edge_types=GRAPHITI_EDGE_TYPES,
    edge_type_map=GRAPHITI_EDGE_TYPE_MAP,
    custom_extraction_instructions=GRAPHITI_CUSTOM_EXTRACTION_INSTRUCTIONS,
  )

  memory_ids = [edge.uuid for edge in result.edges]
  return EpisodeWriteResponse(memory_ids=memory_ids)


@app.post("/v1/search", response_model=list[MemorySearchItem])
async def search_memory(payload: MemorySearchRequest) -> list[MemorySearchItem]:
  graphiti = await get_graphiti()

  # 优化搜索配置，使用 Cross Encoder 进行深度语义精排
  # Cross Encoder 能够更准确地计算查询与结果之间的语义相似度
  config = COMBINED_HYBRID_SEARCH_CROSS_ENCODER.model_copy(deep=True)
  config.limit = payload.top_k

  # 召回阶段：降低相似度阈值，确保召回更多相关候选结果
  config.edge_config.sim_min_score = 0.3
  config.node_config.sim_min_score = 0.3
  config.episode_config.sim_min_score = 0.3
  config.community_config.sim_min_score = 0.3

  # 精排阶段先保持宽松，优先排查“图里有数据但被服务端过滤掉”的问题。
  config.reranker_min_score = 0.0

  filter_payload = dict(payload.filters or {})
  filter_payload.setdefault("node_labels", list(CUSTOM_NODE_LABELS))

  try:
    search_filter = SearchFilters.model_validate(filter_payload)
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"Invalid filters: {e}") from e

  results = await graphiti.search_(
    query=payload.query,
    config=config,
    search_filter=search_filter,
    group_ids=[_namespace_group_id(payload.is_dev)],
  )

  items: list[MemorySearchItem] = []
  for idx, edge in enumerate(results.edges):
    score = results.edge_reranker_scores[idx] if idx < len(results.edge_reranker_scores) else None

    # edge 是主结果来源，显式事实边只要达到基础相关度就保留。
    if score is not None and score < EDGE_RESULT_MIN_SCORE:
      continue

    items.append(
      MemorySearchItem(
        memory=edge.fact,
        time=edge.created_at.astimezone(timezone.utc).isoformat() if edge.created_at else None,
        source=edge.name,
        score=score if score is not None else None,
        validFrom=edge.valid_at.astimezone(timezone.utc).isoformat() if edge.valid_at else None,
        validTo=edge.invalid_at.astimezone(timezone.utc).isoformat() if edge.invalid_at else None,
        metadata=edge.attributes if edge.attributes else None,
      )
    )

  node_items: list[MemorySearchItem] = []
  for idx, node in enumerate(results.nodes):
    score = results.node_reranker_scores[idx] if idx < len(results.node_reranker_scores) else None
    summary = (node.summary or "").strip()
    if not summary:
      continue

    # node summary 只作为兜底来源，相关度要求更高，避免把画像噪声混入事实结果。
    if score is not None and score < NODE_SUMMARY_RESULT_MIN_SCORE:
      continue

    node_items.append(
      MemorySearchItem(
        memory=summary,
        time=node.created_at.astimezone(timezone.utc).isoformat() if node.created_at else None,
        source=node.name,
        score=score if score is not None else None,
        metadata={
          "source_type": "node_summary",
        },
      )
    )

  return items + node_items


@app.delete("/v1/admin/clear-dev", response_model=ClearDevResponse)
async def clear_dev_data() -> ClearDevResponse:
    """
    清理 dev 环境（group_id = "dev"）的所有数据。

    警告：此操作不可逆！
    """
    graphiti = await get_graphiti()

    # 使用 Graphiti 的 driver 直接执行 Cypher 查询
    # 删除所有 group_id 为 "dev" 的节点和关系
    query = """
    MATCH (n {group_id: $group_id})
    DETACH DELETE n
    RETURN count(n) AS deleted_count
    """

    async with graphiti.driver.session() as session:  # type: AsyncSession
        result = await session.run(query, group_id="dev")
        record = await result.single()
        deleted_count = record["deleted_count"] if record else 0

    return ClearDevResponse(deleted_count=deleted_count)
