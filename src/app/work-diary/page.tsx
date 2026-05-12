import { WorkDiaryForm } from "@/components/WorkDiary";
import { WorkDiaryProvider } from "@/context/WorkDiaryContext";

export default function WorkDiaryPage() {
  return (
    <WorkDiaryProvider>
      <WorkDiaryForm />
    </WorkDiaryProvider>
  );
}
