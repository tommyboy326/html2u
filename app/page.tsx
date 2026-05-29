import CreateForm from "@/app/_components/CreateForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="container">
      <header className="stack" style={{ marginBottom: 48, gap: 24 }}>
        <h1 className="hero-display">
          把 AI 產出的 HTML
          <br />
          一鍵變連結。
        </h1>
        <p className="lead">
          貼上 HTML 立刻產生可分享的網址,密碼、一次性連結、自動過期都可選。
          內容在沙箱中顯示,並封鎖對外傳輸。
        </p>
      </header>
      <CreateForm />
    </main>
  );
}
