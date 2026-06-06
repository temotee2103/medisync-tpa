import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Medisync TPA System",
  description: "Medisync TPA platform",
  icons: {
    icon: [
      {
        url: `${basePath}/logo-1.png`,
        type: "image/png",
      },
    ],
    shortcut: [`${basePath}/logo-1.png`],
    apple: [`${basePath}/logo-1.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
