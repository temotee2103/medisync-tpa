"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CategoryManagementPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/companies");
  }, [router]);
  return null;
}
