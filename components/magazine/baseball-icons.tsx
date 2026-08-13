import type { SVGProps } from "react";

const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
type IconProps = SVGProps<SVGSVGElement>;

export function BatIcon(props: IconProps) { return <svg {...base} {...props}><circle cx="5" cy="19" r="1.4" /><path d="M6.1 17.9 12.6 11.4" /><path d="M12 12 19 5" strokeWidth={4} /></svg>; }
export function BaseballIcon(props: IconProps) { return <svg {...base} {...props}><circle cx="12" cy="12" r="9" /><path d="M8 3.7a12 12 0 0 0 0 16.6M16 3.7a12 12 0 0 1 0 16.6" /><path d="M6.2 9.3 7.4 8.7M5.6 12h1.3M6.2 14.7l1.2.6M17.8 9.3 16.6 8.7M18.4 12h-1.3M17.8 14.7l-1.2.6" strokeWidth={1.4} /></svg>; }
export function DiamondIcon(props: IconProps) { return <svg {...base} {...props}><path d="M12 3 21 12 12 21 3 12Z" /><circle cx="12" cy="12" r="1.3" /></svg>; }
export function GloveIcon(props: IconProps) { return <svg {...base} {...props}><path d="M16 18V8a4 4 0 0 0-8 0v10M8 13c-2.2 0-3.5 1-3.5 2.6 0 1.5 1.5 2 3.5 1.2M8 18v1a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1M12 7.5V14" /></svg>; }
export function HomePlateIcon(props: IconProps) { return <svg {...base} {...props}><path d="M5 5h14v6l-7 7-7-7Z" /></svg>; }
