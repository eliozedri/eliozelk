import "server-only";
import path from "node:path";
import { pdf, Font } from "@react-pdf/renderer";
import { createElement } from "react";
import { WorkDiaryDocument } from "@/components/pdf/WorkDiaryDocument";
import type { WorkDiary } from "@/types/workDiary";

let fontsRegisteredForNode = false;

/**
 * WorkDiaryDocument registers Heebo with relative URLs (/fonts/Heebo-*.ttf)
 * that resolve in the browser but not in Node. Font.register is last-write-
 * wins per family, so re-registering with absolute filesystem paths from
 * process.cwd() makes server rendering work.
 */
function registerHeeboFontsForNode() {
  if (fontsRegisteredForNode) return;
  const fontDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Heebo",
    fonts: [
      { src: path.join(fontDir, "Heebo-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDir, "Heebo-Bold.ttf"), fontWeight: 700 },
    ],
  });
  fontsRegisteredForNode = true;
}

export async function renderWorkDiaryToBuffer(diary: WorkDiary): Promise<Buffer> {
  registerHeeboFontsForNode();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = pdf(createElement(WorkDiaryDocument, { diary }) as any);
  const stream = await instance.toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
