"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "yuiju:user_name";
const DEFAULT_USER_NAME = "渺小久";

export function UserNameCard() {
  const [userName, setUserName] = useState(DEFAULT_USER_NAME);
  const [storedUserName, setStoredUserName] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialValue = stored && stored.trim() ? stored : DEFAULT_USER_NAME;
    setUserName(initialValue);
    setStoredUserName(initialValue);
  }, []);

  const hasChanges = useMemo(() => {
    if (storedUserName === null) {
      return false;
    }
    return userName !== storedUserName;
  }, [storedUserName, userName]);

  // 核心逻辑：空字符串表示恢复默认值，否则写入本地存储。
  const handleSave = () => {
    const nextValue = userName.trim();
    if (nextValue) {
      localStorage.setItem(STORAGE_KEY, nextValue);
      setUserName(nextValue);
      setStoredUserName(nextValue);
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setUserName(DEFAULT_USER_NAME);
    setStoredUserName(DEFAULT_USER_NAME);
  };

  return (
    <Card className="h-full min-h-[520px]">
      <div className="p-[14px] grid gap-[14px]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[24px] font-black tracking-[0.2px]">对话标识（user_name）</h3>
          <Badge variant="soft" size="sm" className="border-[#d9e6f5] bg-white text-[#2b2f36]">
            Chat
          </Badge>
        </div>

        <p className="m-0 text-[15px] text-[#6b7480] leading-[1.55]">
          user_name 将用于对话时的用户标识，保存在本地浏览器的 localStorage 中。
        </p>

        <div className="grid gap-[6px]">
          <label className="text-[12px] text-[#6b7480]" htmlFor="userNameInput">
            user_name
          </label>
          <Input
            id="userNameInput"
            className="border-[#d9e6f5] bg-white/90 focus:border-[rgba(145,196,238,0.8)] focus:shadow-[0_0_0_4px_rgba(145,196,238,0.2)]"
            value={userName}
            onChange={(event) => {
              setUserName(event.target.value);
            }}
          />
        </div>

        <div className="flex items-center gap-[10px]">
          <Button
            className="border-[rgba(145,196,238,0.55)] bg-[rgba(145,196,238,0.62)] text-[#2b2f36]"
            type="button"
            disabled={!hasChanges}
            onClick={handleSave}
          >
            保存
          </Button>
          <span className="text-[12px] text-[#6b7480]">
            {hasChanges ? "有未保存的修改" : "已同步到本地"}
          </span>
        </div>
      </div>
    </Card>
  );
}
