/**
 * 讲解风格的持久化（服务端）
 */
import { getSetting, setSetting } from "@/lib/db/repo";
import {
  DEFAULT_TEACHING_PROFILE,
  buildTeachingStyleBlock,
  normalizeTeachingProfile,
  type TeachingProfile,
} from "@/lib/teaching/profile";

const KEY = "teaching_profile";

export function getTeachingProfile(): TeachingProfile {
  try {
    const raw = getSetting(KEY);
    return raw ? normalizeTeachingProfile(JSON.parse(raw)) : DEFAULT_TEACHING_PROFILE;
  } catch {
    return DEFAULT_TEACHING_PROFILE;
  }
}

export function saveTeachingProfile(input: unknown): TeachingProfile {
  const profile = normalizeTeachingProfile(input);
  setSetting(KEY, JSON.stringify(profile));
  return profile;
}

export function currentStyleBlock(): string | null {
  return buildTeachingStyleBlock(getTeachingProfile());
}
