import CreateForm from "@/app/_components/CreateForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="container">
      <header className="stack" style={{ marginBottom: 24 }}>
        <h1>🔗 HTML 網頁分享</h1>
        <p className="muted">
          貼上 HTML,免註冊即可產生一條分享連結。可設定密碼、一次性連結與到期時間。
          內容在隔離沙箱中顯示,並封鎖對外傳輸以防濫用。
        </p>
      </header>
      <CreateForm />
    </main>
  );
}
