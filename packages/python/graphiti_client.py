import asyncio
import json
import logging
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import httpx
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.client import CrossEncoderClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.llm_client import RateLimitError

logger = logging.getLogger(__name__)


class SiliconFlowRerankerClient(CrossEncoderClient):
    """
    硅基流动专业 Rerank API 客户端

    使用 Qwen/Qwen3-Reranker-8B 模型的专业重排服务，该模型专门用于语义相关性排序。

    特点：
    - 使用专业的 Rerank API 端点
    - 模型：Qwen/Qwen3-Reranker-8B，专门为检索重排优化
    - API 端点：/v1/rerank
    - 返回 0-1 范围的相关性分数
    - 比通用 LLM 重排更准确
    """

    def __init__(
        self,
        config: LLMConfig | None = None,
    ):
        """
        初始化硅基流动 Rerank 客户端

        Args:
            config (LLMConfig | None): LLM 配置，需要包含 API 密钥和基础 URL
        """
        if config is None:
            config = LLMConfig()

        self.config = config
        # 构建 rerank API 端点
        base_url = self.config.base_url.rstrip("/")
        self.rerank_url = f"{base_url}/rerank"
        self.default_model = "Qwen/Qwen3-Reranker-8B"

    async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float | None]]:
        """
        使用硅基流动 Rerank API 对段落进行排序

        Args:
            query (str): 查询内容
            passages (list[str]): 待排序的段落列表

        Returns:
            list[tuple[str, float | None]]: 排序后的段落和分数。
            当无法得到可信 rerank 分数时，score 返回 None，表示“仅保留候选顺序，不提供相关度分数”。
        """
        if not passages:
            return []

        if len(passages) <= 1:
            # 单候选场景无法进行真实 rerank，不提供分数，避免被误判为高分或低分。
            return [(passage, None) for passage in passages]

        # 每次调用 rank 时创建新的 client
        client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

        try:
            # 构建请求体
            payload = {
                "model": self.config.model or self.default_model,
                "query": query,
                "documents": passages,
                "top_n": len(passages),
            }

            # 发送请求
            response = await client.post(self.rerank_url, json=payload)

            if response.status_code == 429:
                raise RateLimitError("Rate limit exceeded for rerank API")
            if response.status_code != 200:
                raise Exception(f"Rerank API failed with status {response.status_code}: {response.text}")

            # 解析响应
            data = response.json()

            if "results" not in data:
                raise Exception("Invalid rerank API response structure")

            # 提取分数并配对
            ranked_results = []
            for result in data["results"]:
                passage = passages[result["index"]]
                score = result["relevance_score"]
                ranked_results.append((passage, score))

            # 按分数降序排序
            ranked_results.sort(reverse=True, key=lambda x: x[1])
            return ranked_results

        except Exception as e:
            # rerank 失败时保留原候选顺序，但不伪造分数，避免上层把降级结果误认为真实低分或高分。
            logger.error("SiliconFlow rerank API failed: %s", str(e))
            logger.warning("Falling back to passthrough rank without score")
            return [(passage, None) for passage in passages]
        finally:
            # 关闭客户端
            await client.aclose()


_dotenv_loaded = False
_yuiju_config_cache: dict[str, Any] | None = None


def _load_root_dotenv() -> None:
  global _dotenv_loaded
  if _dotenv_loaded:
    return
  _dotenv_loaded = True

  try:
    from dotenv import load_dotenv
  except Exception:
    return

  repo_root = Path(__file__).resolve().parents[2]
  dotenv_path = repo_root / ".env"
  if not dotenv_path.exists():
    return

  load_dotenv(dotenv_path=dotenv_path, override=False)


def _load_root_yuiju_config() -> dict[str, Any] | None:
  """
  通过 Node + tsx 加载项目根目录的 yuiju.config.ts。

  说明：
  - Python 运行时不直接解析 TypeScript 源码，而是复用项目已有的 Node 工具链；
  - 结果会缓存在进程内，避免每次请求都重复启动 Node 子进程；
  - 读取失败时返回 None，由调用方继续走环境变量 fallback，避免因为桥接失败导致服务不可用。
  """

  global _yuiju_config_cache
  if _yuiju_config_cache is not None:
    return _yuiju_config_cache

  repo_root = Path(__file__).resolve().parents[2]
  config_path = repo_root / "yuiju.config.ts"
  if not config_path.exists():
    return None

  command = [
    "node",
    "--import",
    "tsx",
    "-e",
    (
      "import rootConfig from './yuiju.config.ts'; "
      "const config = rootConfig?.default ?? rootConfig; "
      "console.log(JSON.stringify(config));"
    ),
  ]

  try:
    result = subprocess.run(
      command,
      cwd=repo_root,
      check=True,
      capture_output=True,
      text=True,
    )
  except Exception as error:
    import logging

    logger = logging.getLogger(__name__)
    logger.warning("Failed to load yuiju.config.ts via Node bridge: %s", error)
    return None

  stdout = result.stdout.strip()
  if not stdout:
    return None

  try:
    parsed = json.loads(stdout)
  except json.JSONDecodeError as error:
    import logging

    logger = logging.getLogger(__name__)
    logger.warning("Failed to parse yuiju.config.ts bridge output: %s", error)
    return None

  if not isinstance(parsed, dict):
    return None

  _yuiju_config_cache = parsed
  return _yuiju_config_cache


@dataclass(frozen=True)
class GraphitiEnv:
  """
  Graphiti 初始化配置。

  说明：
  - 本项目使用 OpenAI-compatible 协议的 LLM/Embedding（例如 SiliconFlow）。
  - 处于早期开发阶段：Neo4j 与模型相关配置固定写在代码中，减少配置项。
  - 仅敏感信息（如 key/密码）从环境变量读取，避免泄露。
  """

  neo4j_uri: str
  neo4j_user: str
  neo4j_password: str

  llm_api_key: str
  llm_base_url: str
  llm_model: str
  llm_small_model: str
  embedding_model: str
  reranker_model: str


def _require_env(name: str) -> str:
  value = os.getenv(name)
  if not value:
    raise ValueError(f"Environment variable {name} is required")
  return value


def _resolve_siliconflow_api_key() -> str:
  """
  解析 Graphiti 使用的 SiliconFlow API Key。

  读取顺序：
  1. 项目根目录 yuiju.config.ts 中的 llm.siliconflowApiKey
  2. 环境变量 SILICONFLOW_API_KEY

  说明：
  - 优先与 TS 侧共享同一份配置，避免重构后 Python 配置落后；
  - 环境变量仍保留为 fallback，方便临时调试或桥接失败时兜底。
  """

  config = _load_root_yuiju_config()
  llm = config.get("llm") if isinstance(config, dict) else None
  api_key = llm.get("siliconflowApiKey") if isinstance(llm, dict) else None

  if isinstance(api_key, str) and api_key.strip():
    return api_key.strip()

  return _require_env("SILICONFLOW_API_KEY")


def load_graphiti_env() -> GraphitiEnv:
  """
  读取 Graphiti 初始化配置。

  读取顺序：
  - 优先从项目根目录 yuiju.config.ts 读取与 TS 共用的 LLM key；
  - 如果桥接失败或配置缺失，则回退到环境变量。
  """

  _load_root_dotenv()

  default_neo4j_uri = "bolt://192.168.31.10:7687"
  default_neo4j_user = "neo4j"
  default_neo4j_password = "neo4j123456"
  default_llm_base_url = "https://api.siliconflow.cn/v1"
  default_llm_model = "Pro/MiniMaxAI/MiniMax-M2.5"
  default_llm_small_model = "Qwen/Qwen3.5-9B"
  default_embedding_model = "Qwen/Qwen3-Embedding-0.6B"
  default_reranker_model = "Qwen/Qwen3-Reranker-8B"

  llm_api_key = _resolve_siliconflow_api_key()

  return GraphitiEnv(
    neo4j_uri=default_neo4j_uri,
    neo4j_user=default_neo4j_user,
    neo4j_password=default_neo4j_password,
    llm_api_key=llm_api_key,
    llm_base_url=default_llm_base_url,
    llm_model=default_llm_model,
    llm_small_model=default_llm_small_model,
    embedding_model=default_embedding_model,
    reranker_model=default_reranker_model,
  )


_graphiti_lock = asyncio.Lock()
_graphiti: Optional[Graphiti] = None


async def get_graphiti() -> Graphiti:
  """
  获取全局 Graphiti 单例。

  FastAPI 会在每次请求中调用该函数，因此必须复用同一个实例，避免重复建连与重复建索引。
  """

  global _graphiti
  if _graphiti is not None:
    return _graphiti

  async with _graphiti_lock:
    if _graphiti is not None:
      return _graphiti

    env = load_graphiti_env()

    llm_config = LLMConfig(
      api_key=env.llm_api_key,
      model=env.llm_model,
      small_model=env.llm_small_model,
      base_url=env.llm_base_url,
    )

    embedder_config = OpenAIEmbedderConfig(
      api_key=env.llm_api_key,
      embedding_model=env.embedding_model,
      base_url=env.llm_base_url,
    )

    reranker_config = LLMConfig(
      api_key=env.llm_api_key,
      model=env.reranker_model,
      base_url=env.llm_base_url,
    )

    _graphiti = Graphiti(
      env.neo4j_uri,
      env.neo4j_user,
      env.neo4j_password,
      llm_client=OpenAIGenericClient(config=llm_config),
      embedder=OpenAIEmbedder(config=embedder_config),
      cross_encoder=SiliconFlowRerankerClient(config=reranker_config),
    )
    return _graphiti


async def close_graphiti() -> None:
  """
  关闭 Graphiti 全局单例连接（FastAPI shutdown 时调用）。
  """

  global _graphiti
  if _graphiti is None:
    return

  await _graphiti.close()
  _graphiti = None
