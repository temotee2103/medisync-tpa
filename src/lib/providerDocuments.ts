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
  diagnosis: string;
  mcFrom: string;
  mcTo: string;
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

const drawHeader = (doc: jsPDF, clinicName: string, clinicAddress: string, clinicPhone: string, clinicEmail: string) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(clinicName || "Clinic", 105, 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  if (clinicAddress) doc.text(clinicAddress, 105, 26, { align: "center" });
  if (clinicPhone) doc.text(`Tel: ${clinicPhone}`, 105, 33, { align: "center" });
  if (clinicEmail) doc.text(`Email: ${clinicEmail}`, 105, 40, { align: "center" });

  doc.setDrawColor(190, 190, 190);
  doc.line(15, 45, 195, 45);
};

export const generateMedicalCertificatePdf = (payload: McPdfPayload) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawHeader(doc, payload.clinicName, payload.clinicAddress, payload.clinicPhone, payload.clinicEmail);

  const visitDate = formatDate(payload.visitDate);
  const mcFrom = formatDate(payload.mcFrom);
  const mcTo = formatDate(payload.mcTo);
  const issueDate = formatDate(payload.issueDate);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Date: ${visitDate}`, 20, 56);
  doc.text(`Serial Number: ${payload.serialNumber || "-"}`, 20, 63);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("MEDICAL CERTIFICATE", 105, 78, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("I hereby certify that I have examined:", 20, 91);
  doc.text(`Name: ${payload.memberName || "-"}`, 20, 100);
  doc.text(`NRIC/Passport Number: ${payload.memberIdNo || "-"}`, 20, 109);
  doc.text(`Diagnosis: ${payload.diagnosis || "-"}`, 20, 118);
  doc.text("And find that:", 20, 127);
  doc.text("He/She will be unfit for the proper performance of his/her duties", 20, 136);
  doc.text(`for ${mcFrom || "-"} to ${mcTo || "-"}`, 20, 145);
  doc.text("He/She is advised for re-examination on ______________________", 20, 154);
  doc.text("He/She may be fit for light duty from ______________ to ______________", 20, 163);

  doc.text("Signature & Official Chop:", 20, 248);
  doc.line(74, 248.5, 120, 248.5);
  doc.text(`Date: ${issueDate}`, 135, 248);
  doc.line(147, 248.5, 190, 248.5);

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
