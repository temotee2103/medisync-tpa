import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medisync TPA System",
  description: "Medisync TPA platform",
  icons: {
    icon: [
      {
        url: "/logo-1.png",
        type: "image/png",
      },
    ],
    shortcut: ["/logo-1.png"],
    apple: ["/logo-1.png"],
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
