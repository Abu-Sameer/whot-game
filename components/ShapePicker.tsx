import type { Shape } from "@/lib/types";
import { describeShape } from "@/lib/describe";

interface ShapePickerProps {
  onPick: (shape: Shape) => void;
}

const SHAPES: Shape[] = ["circle", "cross", "square", "star", "triangle"];

const SHAPE_STYLE: Record<Shape, string> = {
  circle: "bg-red-500",
  cross: "bg-blue-500",
  square: "bg-green-500",
  star: "bg-yellow-400 text-black",
  triangle: "bg-purple-500",
  whot: "bg-orange-500",
};

export default function ShapePicker({ onPick }: ShapePickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-zinc-800">
          You played a Whot! Choose the next shape:
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => onPick(shape)}
              className={`flex h-20 w-20 flex-col items-center justify-center rounded-xl text-2xl font-bold text-white shadow-md transition-transform hover:scale-105 hover:shadow-lg ${SHAPE_STYLE[shape]}`}
            >
              {describeShape(shape)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
