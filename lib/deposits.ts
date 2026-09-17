export const depositProfiles = [
  { id: "none", label: "Pfandfrei", bottle: 0, crate: 0 },
  {
    id: "beer",
    label: "Mehrweg Longneck / Bier · 0,08 € + Kasten",
    bottle: 8,
    crate: 150,
  },
  {
    id: "swing",
    label: "Mehrweg Bügel · 0,15 € + Kasten",
    bottle: 15,
    crate: 150,
  },
  {
    id: "reusable",
    label: "Mehrweg · 0,15 € + Kasten",
    bottle: 15,
    crate: 150,
  },
  {
    id: "single",
    label: "Einweg · 0,25 € / Flasche oder Dose",
    bottle: 25,
    crate: 0,
  },
  { id: "sixpack", label: "Bier Sixpack · 6 × 0,08 €", bottle: 8, crate: 0 },
  { id: "custom", label: "Individuelles Pfand", bottle: 0, crate: 0 },
];
export function depositFor(profile: string, count: number, custom = 0) {
  const p = depositProfiles.find((p) => p.id === profile);
  if (!p || profile === "custom") return custom;
  return p.bottle * count + (count > 1 ? p.crate : 0);
}
export const returnTypes = [
  { cents: 8, label: "Bierflasche", kind: "bottle" },
  { cents: 15, label: "Mehrwegflasche", kind: "bottle" },
  { cents: 25, label: "Einweg / Dose", kind: "bottle" },
  { cents: 150, label: "Leerer Kasten", kind: "crate" },
  { cents: 240, label: "6er Wasser", kind: "crate" },
  { cents: 285, label: "9er Wasser", kind: "crate" },
  { cents: 330, label: "12er Wasser", kind: "crate" },
  { cents: 310, label: "20er Bier", kind: "crate" },
  { cents: 342, label: "24er Bier", kind: "crate" },
  { cents: 450, label: "20er Bügel", kind: "crate" },
  { cents: 510, label: "24er Limo", kind: "crate" },
];
