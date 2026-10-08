// Bangladesh-style 4.00 grading scale. Lowest marks first match wins (checked from the top).
const SCALE: { min: number; grade: string; point: number }[] = [
  { min: 80, grade: "A+", point: 4.0 },
  { min: 75, grade: "A", point: 3.75 },
  { min: 70, grade: "A-", point: 3.5 },
  { min: 65, grade: "B+", point: 3.25 },
  { min: 60, grade: "B", point: 3.0 },
  { min: 55, grade: "B-", point: 2.75 },
  { min: 50, grade: "C+", point: 2.5 },
  { min: 45, grade: "C", point: 2.25 },
  { min: 40, grade: "D", point: 2.0 },
  { min: 0, grade: "F", point: 0.0 },
];

export const gradeFor = (marks: number) => {
  const row = SCALE.find((r) => marks >= r.min) ?? SCALE[SCALE.length - 1];
  return { grade: row.grade, gradePoint: row.point };
};

// Credit-weighted GPA: sum(gradePoint * credit) / sum(credit). A failed course (F = 0.00)
// still counts its credits, so it pulls the GPA down.
export const calculateGpa = (items: { credit: number; gradePoint: number }[]) => {
  const totalCredits = items.reduce((sum, i) => sum + i.credit, 0);
  if (totalCredits === 0) return { gpa: 0, totalCredits: 0 };
  const points = items.reduce((sum, i) => sum + i.gradePoint * i.credit, 0);
  return { gpa: Math.round((points / totalCredits) * 100) / 100, totalCredits };
};