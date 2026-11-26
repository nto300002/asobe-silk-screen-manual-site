import { sections as sourceSections } from "@/lib/default-manual.js";
import { skillDb } from "@/lib/skill-db";

export type ManualStep = {
  id: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  detailImages?: { id: string; position: number; url: string }[];
  items: string[];
  progressRefs: [string, number][];
  edited?: boolean;
};

export type ManualSection = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: string;
  cover?: string;
  covers?: string[];
  caution?: string;
  steps: ManualStep[];
};

type LegacyStep = Omit<ManualStep, "progressRefs"> & {
  progressRefs?: [string, number][];
  progressIndices?: number[];
};
type LegacySection = Omit<ManualSection, "steps"> & { steps: LegacyStep[] };

export const defaultSections: ManualSection[] = (sourceSections as LegacySection[]).map(section => ({
  id: section.id,
  number: section.number,
  title: section.title,
  subtitle: section.subtitle,
  icon: section.icon,
  cover: section.id === "plate" ? "/step_02.JPG" : undefined,
  caution: section.id === "plate" ? "版とフィルムの位置を揃え、露光前にずれや汚れがないか確認する" : undefined,
  steps: section.steps.map(step => ({
    id: step.id,
    title: step.title,
    description: step.description,
    image: step.image,
    imageAlt: step.imageAlt,
    items: [...step.items],
    progressRefs: step.items.map((_, index) => step.progressRefs?.[index] ?? [step.id, step.progressIndices?.[index] ?? index]),
  })),
}));

const protectedDefaults: Record<string, string> = {
  "/step_02.JPG": "/api/manual/default-images/step_02.JPG",
  "/data-receive-example.jpg": "/api/manual/default-images/data-receive-example.jpg",
  "/data-levels-example.jpg": "/api/manual/default-images/data-levels-example.jpg",
};

function protectedImage(value?: string): string | undefined {
  return value ? protectedDefaults[value] ?? value : value;
}

export function protectManualImages(sections: ManualSection[]): ManualSection[] {
  return sections.map(section => ({
    ...section,
    cover: protectedImage(section.cover),
    covers: section.covers?.map(image => protectedImage(image)!),
    steps: section.steps.map(step => ({
      ...step,
      image: protectedImage(step.image),
      detailImages: step.detailImages?.map(image => ({ ...image, url: protectedImage(image.url)! })),
    })),
  }));
}

export function maskManualImages(sections: ManualSection[]): ManualSection[] {
  const mask = (value?: string) => value ? "/manual-locked.svg" : value;
  return sections.map(section => ({
    ...section,
    cover: mask(section.cover),
    covers: section.covers?.map(() => "/manual-locked.svg"),
    steps: section.steps.map(step => ({
      ...step,
      image: mask(step.image),
      detailImages: step.detailImages?.map(image => ({ ...image, url: "/manual-locked.svg" })),
    })),
  }));
}

export async function readManual(): Promise<{ sections: ManualSection[]; version: number }> {
  const row = await skillDb().prepare("SELECT content, version FROM manual_documents WHERE id = 1")
    .first<{ content: string; version: number }>();
  return row ? { sections: protectManualImages(JSON.parse(row.content) as ManualSection[]), version: row.version }
    : { sections: protectManualImages(defaultSections), version: 0 };
}

const allowedImage = (value: unknown) => value === undefined || value === "" ||
  (typeof value === "string" && /^\/(?:api\/manual\/(?:images\/manual-[a-f0-9-]+\.(?:jpg|png|webp)|default-images\/(?:step_02\.JPG|data-(?:receive|levels)-example\.jpg))|[a-z0-9_-]+\.(?:jpg|JPG|png|webp))$/.test(value));
const validText = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function validateManual(value: unknown): value is ManualSection[] {
  if (!Array.isArray(value) || value.length < defaultSections.length || value.length > 30) return false;
  const originalSections = new Map(defaultSections.map(section => [section.id, section]));
  const sectionIds = new Set<string>();
  const stepIds = new Set<string>();
  const refs = new Set<string>();
  const validSections = value.every((section, sectionIndex) => {
    if (!section || typeof section !== "object" || typeof section.id !== "string" || sectionIds.has(section.id) ||
      section.number !== String(sectionIndex + 1).padStart(2, "0") ||
      (originalSections.has(section.id)
        ? section.icon !== originalSections.get(section.id)?.icon
        : !/^section-[a-z0-9-]{1,80}$/.test(section.id) || section.icon !== "sparkle") ||
      !validText(section.title, 80) || !validText(section.subtitle, 200) ||
      !allowedImage(section.cover) ||
      (section.covers !== undefined && (!Array.isArray(section.covers) || section.covers.length > 40 ||
        section.covers.some((image: unknown) => !allowedImage(image) || !image))) ||
      (section.caution !== undefined && (typeof section.caution !== "string" || section.caution.length > 500)) ||
      !Array.isArray(section.steps) || section.steps.length > 80) return false;
    sectionIds.add(section.id);
    return section.steps.every((step: ManualStep) => {
      if (!step || typeof step !== "object" || typeof step.id !== "string" ||
        !/^[a-z0-9-]{1,100}$/.test(step.id) || stepIds.has(step.id) ||
        !validText(step.title, 100) || !validText(step.description, 300) ||
        !allowedImage(step.image) ||
        (step.imageAlt !== undefined && (typeof step.imageAlt !== "string" || step.imageAlt.length > 200)) ||
        !Array.isArray(step.items) || step.items.length < 1 || step.items.length > 50 ||
        (step.detailImages !== undefined && (!Array.isArray(step.detailImages) || step.detailImages.length > 100 ||
          step.detailImages.some(photo => !photo || typeof photo !== "object" ||
            typeof photo.id !== "string" || !/^[a-z0-9-]{1,100}$/.test(photo.id) ||
            !Number.isInteger(photo.position) || photo.position < 0 || photo.position > step.items.length ||
            !allowedImage(photo.url) || !photo.url) ||
          new Set(step.detailImages.map(photo => photo.id)).size !== step.detailImages.length)) ||
        !Array.isArray(step.progressRefs) || step.progressRefs.length !== step.items.length ||
        step.items.some(item => !validText(item, 500))) return false;
      stepIds.add(step.id);
      return step.progressRefs.every(ref => {
        if (!Array.isArray(ref) || ref.length !== 2 || typeof ref[0] !== "string" ||
          !/^[a-z0-9-]{1,100}$/.test(ref[0]) || !Number.isInteger(ref[1]) || ref[1] < 0 || ref[1] > 1000) return false;
        const key = `${ref[0]}:${ref[1]}`;
        if (refs.has(key)) return false;
        refs.add(key);
        return true;
      });
    });
  });
  return validSections && defaultSections.every(section => sectionIds.has(section.id));
}
