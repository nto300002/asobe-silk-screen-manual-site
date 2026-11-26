type Props = { text: string; tone: "error" | "success"; id?: string; className?: string };

export default function AccountMessage({ text, tone, id, className = "" }: Props) {
  return <div id={id} className={`account-message is-${tone} ${className}`.trim()} role={tone === "error" ? "alert" : "status"}>
    <span className="account-message-icon" aria-hidden="true">{tone === "error" ? "!" : "✓"}</span>
    <div><strong>{tone === "error" ? "操作できませんでした" : "完了しました"}</strong><p>{text}</p></div>
  </div>;
}
