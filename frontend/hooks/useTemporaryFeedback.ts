"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Phản hồi ngắn sau thao tác; hủy timer khi unmount hoặc thao tác lại. */
export function useTemporaryFeedback(duration = 1500) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    setActive(true);
    timer.current = setTimeout(() => setActive(false), duration);
  }, [duration]);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return { active, trigger };
}
