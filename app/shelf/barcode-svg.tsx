import { code128 } from "@/lib/barcode";

/**
 * A Code 128 symbol as SVG.
 *
 * SVG rather than a canvas or an image, because the bars have to land on exact
 * boundaries. A resampled bitmap blurs the module edges, and a blurred edge is
 * a barcode a camera cannot resolve - the failure looks like "the scanner is
 * flaky" rather than "the image is wrong".
 *
 * `shapeRendering="crispEdges"` is doing the same job: it stops the renderer
 * antialiasing a one-module bar into two grey ones.
 *
 * @param module Width of the narrowest bar, in CSS pixels. Below about 2 a
 *   phone camera struggles at arm's length from a laptop screen.
 */
export function BarcodeSvg({
  value,
  module = 2,
  height = 56,
}: {
  value: string;
  module?: number;
  height?: number;
}) {
  const { bars, width } = code128(value);

  return (
    <svg
      // The viewBox is in modules and the rendered size is in pixels, so the
      // symbol scales without ever landing a bar on a fractional boundary.
      viewBox={`0 0 ${width} ${height}`}
      width={width * module}
      height={height}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
      className="max-w-full"
    >
      {/* The quiet zone has to be white, not transparent. On a dark page a
          transparent barcode sits on navy and the contrast a scanner needs
          is not there. */}
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y="0"
          width={b.width}
          height={height}
          fill="#000000"
        />
      ))}
    </svg>
  );
}
