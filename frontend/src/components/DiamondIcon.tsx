type DiamondIconProps = { size?: number; className?: string; alt?: string; fill?: string };

export function DiamondIcon({ size = 18, className = '', alt = '' }: DiamondIconProps) {
  return <img className={`diamond-icon ${className}`.trim()} src="/diamond.webp" width={size} height={size} alt={alt} />;
}
