"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ensureMemberSeed, getMemberSession } from "@/lib/memberSession";

export default function MemberIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      await ensureMemberSeed();
      const session = getMemberSession();
      router.replace(session ? "/member/dashboard" : "/member/login");
    };
    run();
  }, [router]);

  return null;
}
