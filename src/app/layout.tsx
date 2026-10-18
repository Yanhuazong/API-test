import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Investigation",
  description: "A fictional campus advising API for learning API design.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#183044", background: "#f4f8fb" }}>
        {children}
      </body>
    </html>
  );
}
