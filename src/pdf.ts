import { visitArea } from "./domain";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Data, Appointment } from "./types";
import { dateLabel, euro, fullName, minutes, visitStats } from "./domain";
export async function createReport(d: Data, a: Appointment, print = false) {
  const pdf = new jsPDF();
  const p = d.profiles[0],
    f = d.facilities.find((f) => f.id === a.facility_id),
    g = d.groups.find((g) => g.id === a.group_id),
    s = visitStats(d, a);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(23, 88, 79);
  pdf.text(p?.business_name || "HeimFriseur", 16, 20);
  pdf.setTextColor(65);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const contact = [
    p
      ? [p.street, p.house_number, p.postal_code, p.city]
          .filter(Boolean)
          .join(" ")
      : "",
    p?.phone,
    p?.email,
  ].filter(Boolean);
  contact.forEach((line, i) => pdf.text(String(line), 16, 28 + i * 5));
  if (p?.logo_url) {
    try {
      const r = await fetch(p.logo_url, { mode: "cors" });
      if (r.ok) {
        const blob = await r.blob();
        if (blob.type.startsWith("image/") && blob.size < 2_000_000) {
          const reader = new FileReader();
          const url = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          });
          pdf.addImage(url, 160, 12, 30, 22, undefined, "FAST");
        }
      }
    } catch {
      /* A missing remote logo never prevents a report. */
    }
  }
  const y = Math.max(52, contact.length * 5 + 40);
  pdf.setDrawColor(215);
  pdf.line(16, y - 5, 194, y - 5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Besuchsbericht", 16, y + 5);
  pdf.setFontSize(11);
  pdf.text(f?.name || "", 16, y + 14);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    `${visitArea(d, a)} | ${dateLabel(a.appointment_date)} | ${a.start_time.slice(0, 5)} Uhr`,
    16,
    y + 21,
  );
  autoTable(pdf, {
    startY: y + 28,
    head: [["Kunde", "Zimmer", "Leistungen", "Dauer", "Preis"]],
    body: s.members.map((m) => {
      const c = d.customers.find((c) => c.id === m.customer_id);
      const t = s.completed.find((t) => t.appointment_customer_id === m.id);
      return [
        c ? fullName(c) : "Kunde",
        c?.room_number || "–",
        t
          ? d.treatment_services
              .filter((x) => x.treatment_id === t.id)
              .map((x) => x.service_name_snapshot)
              .join(", ")
          : "Nicht durchgeführt",
        t ? minutes(Number(t.duration_minutes)) : "–",
        t ? euro(t.total_price) : "–",
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: [23, 88, 79] },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3 },
    columnStyles: { 2: { cellWidth: 66 } },
    margin: { left: 16, right: 16 },
  });
  let finalY =
    (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 10;
  if (finalY > 205) {
    pdf.addPage();
    finalY = 20;
  }
  autoTable(pdf, {
    startY: finalY,
    body: [
      ["Geplante Kunden", String(s.members.length)],
      ["Erledigt", String(s.done)],
      ["Nicht durchgeführt", String(s.skipped)],
      ["Gesamtarbeitszeit", minutes(s.work)],
      ["Behandlungszeit", minutes(s.treatment)],
      ["Umsatz", euro(s.revenue)],
      ["Materialkosten", euro(s.material)],
      ["Umsatz nach Material", euro(s.revenue - s.material)],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 85 } },
    margin: { left: 16, right: 16 },
  });
  finalY =
    (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 24;
  if (finalY > 265) {
    pdf.addPage();
    finalY = 40;
  }
  pdf.line(16, finalY, 91, finalY);
  pdf.line(112, finalY, 194, finalY);
  pdf.setFontSize(9);
  pdf.text("Unterschrift Friseur", 16, finalY + 6);
  pdf.text("Unterschrift Einrichtung", 112, finalY + 6);
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(`${dateLabel(a.appointment_date)} · Besuchsbericht`, 16, 286);
    pdf.text(`Seite ${i} / ${total}`, 194, 286, { align: "right" });
  }
  if (print) {
    pdf.autoPrint();
    const url = URL.createObjectURL(pdf.output("blob"));
    const win = window.open(url, "_blank");
    if (!win) pdf.save(`Besuchsbericht-${a.appointment_date}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else pdf.save(`Besuchsbericht-${a.appointment_date}.pdf`);
}
