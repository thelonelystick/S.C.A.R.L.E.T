import Sigil from "./Sigil";
export default function Brand() {
  return (
    <span className="brand">
      <Sigil size={39} />
      <span>
        <strong>
          SCARLET<span className="brand-dot">.</span>
        </strong>
        <small>ASSISTANT OS</small>
      </span>
    </span>
  );
}
