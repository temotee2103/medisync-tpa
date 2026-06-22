import { jsPDF } from "jspdf";

type McPdfPayload = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  visitDate: string;
  serialNumber: string;
  memberName: string;
  memberIdNo: string;
  diagnoses: string[];
  mcFrom: string;
  mcTo: string;
  reExaminationDate?: string;
  fitDutyFrom?: string;
  fitDutyTo?: string;
  issueDate: string;
  filename: string;
};

type ReferralPdfPayload = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  date: string;
  specialistName: string;
  hospital: string;
  memberName: string;
  memberIdNo: string;
  details: string;
  filename: string;
};

const formatDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const wrapAddress = (doc: jsPDF, address: string, maxWidth: number) => {
  if (!address) return [""];
  // Split long addresses across multiple lines
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const part of parts) {
    const wrapped = doc.splitTextToSize(part, maxWidth);
    lines.push(...(Array.isArray(wrapped) ? wrapped : [wrapped]));
  }
  return lines;
};

const drawHeader = (doc: jsPDF, clinicName: string, clinicAddress: string, clinicPhone: string, clinicEmail: string) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(clinicName || "Clinic", 105, 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let y = 26;
  if (clinicAddress) {
    const addressLines = wrapAddress(doc, clinicAddress, 170);
    for (const line of addressLines) {
      if (line.trim()) {
        doc.text(line.trim(), 105, y, { align: "center" });
        y += 6;
      }
    }
  }
  if (clinicPhone) {
    doc.text(`Tel: ${clinicPhone}`, 105, y, { align: "center" });
    y += 6;
  }
  if (clinicEmail) {
    doc.text(`Email: ${clinicEmail}`, 105, y, { align: "center" });
    y += 6;
  }

  doc.setDrawColor(190, 190, 190);
  doc.line(15, y + 3, 195, y + 3);
};

export const generateMedicalCertificatePdf = (payload: McPdfPayload) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawHeader(doc, payload.clinicName, payload.clinicAddress, payload.clinicPhone, payload.clinicEmail);

  const visitDate = formatDate(payload.visitDate);
  const mcFrom = formatDate(payload.mcFrom);
  const mcTo = formatDate(payload.mcTo);
  const issueDate = formatDate(payload.issueDate);
  const reExamDate = formatDate(payload.reExaminationDate || "");
  const fitFromDate = formatDate(payload.fitDutyFrom || "");
  const fitToDate = formatDate(payload.fitDutyTo || "");
  const diagnoses = payload.diagnoses?.filter(Boolean) || ["-"];

  let y = 56;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Date: ${visitDate}`, 20, y); y += 7;
  doc.text(`Serial Number: ${payload.serialNumber || "-"}`, 20, y); y += 7;

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("MEDICAL CERTIFICATE", 105, y, { align: "center" });
  y += 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("I hereby certify that I have examined:", 20, y); y += 9;
  doc.text(`Name: ${payload.memberName || "-"}`, 20, y); y += 9;
  doc.text(`NRIC/Passport Number: ${payload.memberIdNo || "-"}`, 20, y); y += 9;

  // Multiple diagnoses
  doc.text("Diagnosis:", 20, y); y += 9;
  for (let i = 0; i < diagnoses.length; i++) {
    const num = diagnoses.length > 1 ? `${i + 1}. ` : "";
    doc.text(`${num}${diagnoses[i]}`, 25, y);
    y += 8;
  }

  y += 4;
  doc.text("And find that:", 20, y); y += 9;
  doc.text("He/She will be unfit for the proper performance of his/her duties", 20, y); y += 9;
  doc.text(`for ${mcFrom || "-"} to ${mcTo || "-"}`, 20, y); y += 11;

  // Re-examination date
  doc.text(`He/She is advised for re-examination on ${reExamDate || "______________________"}`, 20, y); y += 11;

  // Fit for light duty
  if (fitFromDate || fitToDate) {
    doc.text(`He/She may be fit for light duty from ${fitFromDate || "______________"} to ${fitToDate || "______________"}`, 20, y);
  } else {
    doc.text("He/She may be fit for light duty from ______________ to ______________", 20, y);
  }
  y += 11;

  y = Math.max(y + 10, 248);
  doc.text("Signature & Official Chop:", 20, y);
  doc.line(74, y + 0.5, 120, y + 0.5);
  doc.text(`Date: ${issueDate}`, 135, y);
  doc.line(147, y + 0.5, 190, y + 0.5);

  const blob = doc.output("blob");
  doc.save(payload.filename);
  return new File([blob], payload.filename, { type: "application/pdf" });
};

export const generateReferralLetterPdf = (payload: ReferralPdfPayload) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawHeader(doc, payload.clinicName, payload.clinicAddress, payload.clinicPhone, payload.clinicEmail);

  const letterDate = formatDate(payload.date);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Date: ${letterDate}`, 20, 58);
  doc.text(`Specialist Name: ${payload.specialistName || "____________________"}`, 20, 67);
  doc.text(`Hospital: ${payload.hospital || "____________________"}`, 20, 76);

  doc.setFont("helvetica", "bold");
  doc.text("Referral Details", 20, 92);

  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${payload.memberName || "-"}`, 20, 102);
  doc.text(`NRIC/Passport: ${payload.memberIdNo || "-"}`, 20, 111);

  const details = payload.details?.trim() || "Please assess and continue specialist management for the above patient.";
  const wrapped = doc.splitTextToSize(details, 170);
  doc.text(wrapped, 20, 126);

  doc.text("Signature & Clinic Stamp:", 20, 248);
  doc.line(72, 248.5, 140, 248.5);

  const blob = doc.output("blob");
  doc.save(payload.filename);
  return new File([blob], payload.filename, { type: "application/pdf" });
};
