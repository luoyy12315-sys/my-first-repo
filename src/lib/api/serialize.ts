import {
  getExerciseByBlockId,
  getExercisePublic,
  listExercisesByBlockId,
} from "@/lib/db/repo";
import type { BlockDTO, ExercisePublic } from "@/lib/types";

export type BlockWithExercise = BlockDTO & {
  exercise?: ExercisePublic | null;
  quizExercises?: ExercisePublic[];
};

/**
 * 下发教学组件时附加"公开版练习"（不含答案）。
 * 答案、评分规则永远不下发；解析文本由模型提供（不含答案本身）。
 */
export function serializeBlock(block: BlockDTO): BlockWithExercise {
  if (block.kind === "quiz") {
    return { ...block, quizExercises: listExercisesByBlockId(block.id) };
  }
  if (block.kind !== "exercise") return block;
  const exerciseId = (block.payload as { exerciseId?: string }).exerciseId;
  const exercise = exerciseId ? getExercisePublic(exerciseId) : getExerciseByBlockId(block.id);
  return { ...block, exercise };
}
