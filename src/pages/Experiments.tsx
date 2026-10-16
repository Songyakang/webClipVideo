import { Link } from "react-router-dom";

// 体验版功能和仍在开发中的功能统一在此展示。
const FEATURES = [
  {
    id: "audio-node",
    title: "音频节点",
    category: "声音创作",
    status: "开发中",
    description: "计划在画布中独立管理音频素材，让声音与视频、图片一起参与创作。",
    detail: "独立音频节点尚未开放，后续将在这里提供体验入口。",
    icon: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    color: "bg-[#1a2a3d] text-[#79c0ff]",
  },
  {
    id: "script-node",
    title: "脚本节点",
    category: "创作规划",
    status: "可体验",
    description: "从故事原稿到分镜卡片，编排画面、旁白和镜头节奏，让每个创作想法都有迹可循。",
    detail: "支持手动编排；桌面端可用 AI 拆分原稿，预览后替换或追加分镜。",
    href: "/experiments/script",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    color: "bg-[#2a203d] text-[#d2a8ff]",
  },
  {
    id: "generation-history",
    title: "生成历史",
    category: "素材管理",
    status: "未发布",
    description: "计划集中查看以往生成的素材，快速挑选并重新放入画布，减少重复操作。",
    detail: "生成历史选择入口尚未接入，发布后即可体验。",
    icon: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
    color: "bg-[#16312a] text-[#7ee7b7]",
  },
];

export default function Experiments() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-md text-sm text-[#8b949e] no-underline transition-colors hover:text-[#e6edf3] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#58a6ff]"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 19-7-7 7-7M5 12h14" />
        </svg>
        返回首页
      </Link>

      <header className="mb-8 mt-8 border-b border-[#30363d] pb-7">
        <p className="mb-3 text-xs font-medium tracking-widest text-[#79c0ff]">探索更多创作可能</p>
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-[#e6edf3]">体验功能</h1>
        <p className="mb-0 mt-3 max-w-2xl text-sm leading-7 text-[#8b949e]">
          这里收录正在开发或尚未发布的新功能。先了解我们正在探索的方向，开放体验后即可从这里进入。
        </p>
      </header>

      <section aria-labelledby="features-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="features-heading" className="m-0 text-base font-semibold text-[#e6edf3]">功能预览</h2>
          <span className="text-xs text-[#8b949e]">{FEATURES.length} 项探索中</span>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.id}>
              <article aria-labelledby={`${feature.id}-title`} className="flex h-full flex-col rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className={`flex size-12 items-center justify-center rounded-xl ${feature.color}`}>
                    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{feature.icon}</svg>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${feature.status === "可体验" ? "border-[#7ee7b733] bg-[#7ee7b71a] text-[#7ee7b7]" : feature.status === "开发中" ? "border-[#9e6a0333] bg-[#9e6a031a] text-[#e3b341]" : "border-[#8b949e33] bg-[#8b949e1a] text-[#b1bac4]"}`}>
                    {feature.status}
                  </span>
                </div>
                <p className="mb-2 mt-0 text-xs text-[#8b949e]">{feature.category}</p>
                <h3 id={`${feature.id}-title`} className="m-0 text-lg font-semibold text-[#e6edf3]">{feature.title}</h3>
                <p className="mb-6 mt-3 flex-1 text-sm leading-7 text-[#b1bac4]">{feature.description}</p>
                <p className="m-0 border-t border-[#30363d] pt-4 text-xs leading-6 text-[#8b949e]">{feature.detail}</p>
                {feature.href && <Link to={feature.href} className="mt-4 flex items-center justify-between rounded-lg border border-[#d2b9ff]/25 bg-[#d2b9ff]/10 px-4 py-2.5 text-sm text-[#d2b9ff] no-underline transition-colors hover:bg-[#d2b9ff]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2b9ff]">开始体验 <span aria-hidden="true">↗</span></Link>}
              </article>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
