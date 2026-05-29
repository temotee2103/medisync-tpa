const fs = require("fs");

function replaceInFile(path, replacers) {
  let text = fs.readFileSync(path, "utf8");
  for (const [from, to] of replacers) {
    if (!text.includes(from)) {
      throw new Error(`Pattern not found in ${path}: ${from}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text, "utf8");
}

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/admin/layout.tsx", [
  [
    'import type { AdminRole } from "@/lib/adminSession";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";',
    'import type { AdminRole } from "@/lib/adminSession";\nimport { resetSharedClientState } from "@/lib/clientStateReset";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";'
  ],
  [
    '} catch {\n        router.replace("/admin/login");',
    '} catch {\n        resetSharedClientState();\n        router.replace("/admin/login");'
  ],
  [
    '      if (!data.session) {\n        router.replace("/admin/login");',
    '      if (!data.session) {\n        resetSharedClientState();\n        router.replace("/admin/login");'
  ],
  [
    '              try {\n                await fetch("/api/auth/logout", { method: "POST" });',
    '              try {\n                resetSharedClientState();\n                await fetch("/api/auth/logout", { method: "POST" });'
  ]
]);

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/member/layout.tsx", [
  [
    'import { withBasePath } from "@/lib/basePath";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";',
    'import { withBasePath } from "@/lib/basePath";\nimport { resetSharedClientState } from "@/lib/clientStateReset";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";'
  ],
  [
    '        if (!data.session) {\n          router.replace("/member/login");',
    '        if (!data.session) {\n          resetSharedClientState();\n          router.replace("/member/login");'
  ],
  [
    '} catch {\n        router.replace("/member/login");',
    '} catch {\n        resetSharedClientState();\n        router.replace("/member/login");'
  ],
  [
    '              try {\n                await fetch("/api/auth/logout", { method: "POST" });',
    '              try {\n                resetSharedClientState();\n                await fetch("/api/auth/logout", { method: "POST" });'
  ]
]);

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/provider/layout.tsx", [
  [
    'import { withBasePath } from "@/lib/basePath";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";\nimport {\n  clearProviderSession,\n  normalizeProviderUserRole,\n  setProviderSession,\n  type ProviderSession,\n} from "@/lib/providerSession";',
    'import { withBasePath } from "@/lib/basePath";\nimport { resetSharedClientState } from "@/lib/clientStateReset";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";\nimport {\n  normalizeProviderUserRole,\n  setProviderSession,\n  type ProviderSession,\n} from "@/lib/providerSession";'
  ],
  ['clearProviderSession();', 'resetSharedClientState();']
]);

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/admin/login/page.tsx", [
  [
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";',
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";\nimport { resetSharedClientState } from "@/lib/clientStateReset";\nimport { createSupabaseBrowserClient } from "@/lib/supabase/client";'
  ],
  [
    '    try {\n      const response = await fetch("/api/auth/admin/login", {',
    '    try {\n      resetSharedClientState();\n      const response = await fetch("/api/auth/admin/login", {'
  ]
]);

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/member/login/page.tsx", [
  [
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";',
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";\nimport { resetSharedClientState } from "@/lib/clientStateReset";'
  ],
  [
    '    try {\n      const response = await fetch("/api/auth/member/login", {',
    '    try {\n      resetSharedClientState();\n      const response = await fetch("/api/auth/member/login", {'
  ]
]);

replaceInFile("d:/wampserver/www/medisync-tpa/src/app/provider/login/page.tsx", [
  [
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";',
    'import Image from "next/image";\nimport { withBasePath } from "@/lib/basePath";\nimport { resetSharedClientState } from "@/lib/clientStateReset";'
  ],
  [
    '    try {\n      const response = await fetch("/api/auth/provider/login", {',
    '    try {\n      resetSharedClientState();\n      const response = await fetch("/api/auth/provider/login", {'
  ]
]);
