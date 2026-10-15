// Quiet, abstract leaf silhouettes. Decorative only.
const LEAF = "M50 2C78 22 92 52 76 80c-8 14-18 18-26 18S32 94 24 80C8 52 22 22 50 2Z";

export default function Leaves() {
  return (
    <div className="leaves" aria-hidden="true">
      <svg className="leaf leaf-a" viewBox="0 0 100 100">
        <path d={LEAF} />
        <path d="M50 10v86" className="vein" />
      </svg>
      <svg className="leaf leaf-b" viewBox="0 0 100 100">
        <path d={LEAF} />
        <path d="M50 10v86" className="vein" />
      </svg>
      <svg className="leaf leaf-c" viewBox="0 0 100 100">
        <path d={LEAF} />
      </svg>
      <div className="glow" />
    </div>
  );
}
