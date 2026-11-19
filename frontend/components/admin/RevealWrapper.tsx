'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface RevealWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Component bọc hiệu ứng hiện dần (fade-in + trượt 8px) khi cuộn vào viewport.
 * Sử dụng IntersectionObserver nội bộ, tuân thủ tuyệt đối quy tắc render của React 19.
 */
export function RevealWrapper({ children, className = '' }: RevealWrapperProps) {
  const domRef = useRef<HTMLDivElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const el = domRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={domRef}
      className={`${className} ${isRevealed ? 'admin-revealed' : 'admin-reveal-init'}`}
    >
      {children}
    </div>
  );
}
