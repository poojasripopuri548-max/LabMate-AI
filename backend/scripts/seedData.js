import dotenv from "dotenv";
import connectDB from "../config/db.js";
import mongoose from "mongoose";
import Laboratory from "../models/Laboratory.js";
import Equipment from "../models/Equipment.js";
import User from "../models/User.js";

dotenv.config();

// Laboratory seed data (name, department, building, room)
const LABS = [
  ["Biology Laboratory", "Biotechnology", "Block B", "B-101"],
  ["Electronics Laboratory", "Electronics & Communication", "Block E", "E-204"],
  ["Electrical Laboratory", "Electrical & Electronics", "Block E", "E-110"],
  ["Embedded Systems Laboratory", "Electronics & Communication", "Block E", "E-301"],
  ["VLSI Design Laboratory", "Electronics & Communication", "Block E", "E-305"],
  ["Biochemistry Laboratory", "Chemistry", "Block B", "B-110"],
  ["Chemistry Laboratory", "Chemistry", "Block C", "C-102"],
  ["Instrumentation Laboratory", "Chemistry", "Block C", "C-210"],
  ["Mechanical Workshop", "Mechanical Engineering", "Block M", "M-101"],
  ["Innovation Prototyping Lab", "Computer Science", "Block I", "I-101"],
  ["AI & Computing Lab", "Computer Science", "Block A", "A-201"],
];

// Equipment rows derived from ml-service/data/sample_equipment_data.csv
// [name, category, labName, totalQty, description, specText, condition, status]
const EQUIPMENT = [
  ["Compound Microscope", "Microscopy", "Biology Laboratory", 12, "Binocular compound light microscope for observing stained cell and tissue slides in biology and biotechnology practicals", "40x-1000x magnification; LED illumination; mechanical stage", "working", "active"],
  ["Stereo Microscope", "Microscopy", "Biology Laboratory", 6, "Low power stereo microscope for viewing larger specimens, dissection work and PCB inspection", "10x-40x magnification; dual light; long working distance", "working", "active"],
  ["USB Digital Microscope", "Microscopy", "Electronics Laboratory", 4, "Digital microscope with USB camera for capturing images of specimens and electronic components on a computer", "2MP camera; 50x-500x magnification; USB; image capture software", "under_maintenance", "active"],
  ["Digital Multimeter", "Electronics Measurement", "Electronics Laboratory", 20, "Handheld digital multimeter for measuring voltage, current, resistance and continuity in circuits", "True RMS; 600V AC/DC; 10A; auto-range", "working", "active"],
  ["Analog Multimeter", "Electronics Measurement", "Electronics Laboratory", 8, "Needle type analog multimeter for basic voltage, current and resistance checks", "0-500V; 250mA; manual range selection", "damaged", "active"],
  ["Clamp Meter", "Electronics Measurement", "Electrical Laboratory", 5, "Clamp-on current meter for non-contact AC current measurement in power circuits", "AC current up to 400A; voltage; resistance; continuity", "working", "active"],
  ["Digital Storage Oscilloscope", "Electronics Measurement", "Electronics Laboratory", 6, "100 MHz two channel digital oscilloscope for viewing and analysing electronic signals and waveforms", "100MHz bandwidth; 2 channels; 1GSa/s; USB", "damaged", "active"],
  ["Analog Oscilloscope", "Electronics Measurement", "Electrical Laboratory", 4, "Analog cathode ray oscilloscope for waveform display, frequency and phase measurements", "20MHz; dual trace; CRT display", "damaged", "unavailable"],
  ["Function Generator", "Electronics Measurement", "Electronics Laboratory", 6, "Signal source producing sine, square and triangular waveforms for testing circuits", "0.1Hz-5MHz; sine/square/triangle; 20Vpp", "working", "active"],
  ["Regulated DC Power Supply", "Electronics Measurement", "Electronics Laboratory", 10, "Variable bench DC power supply for powering circuits with adjustable voltage and current limit", "0-30V; 0-5A; dual display; overcurrent protection", "damaged", "active"],
  ["Arduino Uno Starter Kit", "Embedded Systems", "Embedded Systems Laboratory", 25, "Arduino Uno microcontroller kit with sensors, breadboard and jumper wires for embedded and IoT projects", "ATmega328P; 14 digital IO; USB; sensor pack", "working", "active"],
  ["Raspberry Pi 4 Kit", "Embedded Systems", "Embedded Systems Laboratory", 10, "Single board computer kit for Linux based IoT, computer vision and edge AI prototypes", "Quad-core ARM; 4GB RAM; WiFi; GPIO; microSD", "working", "active"],
  ["ESP32 Development Board Kit", "Embedded Systems", "Embedded Systems Laboratory", 15, "WiFi and Bluetooth enabled microcontroller board for wireless IoT sensing projects", "Dual-core; WiFi; Bluetooth; 30 GPIO; ADC", "working", "active"],
  ["FPGA Development Board", "Embedded Systems", "VLSI Design Laboratory", 4, "FPGA board for digital logic design, Verilog and VHDL experiments", "Artix-7; 33k logic cells; switches and LEDs", "working", "active"],
  ["Benchtop Centrifuge", "Biology and Chemistry", "Biochemistry Laboratory", 3, "Laboratory centrifuge for separating samples by density in biological and chemical experiments", "Up to 5000 rpm; 6 x 15 ml tubes; digital timer", "working", "active"],
  ["Magnetic Stirrer Hot Plate", "Biology and Chemistry", "Chemistry Laboratory", 8, "Hot plate with magnetic stirring for heating and mixing solutions", "Up to 300 C; 1500 rpm; ceramic top", "working", "active"],
  ["Digital pH Meter", "Biology and Chemistry", "Chemistry Laboratory", 6, "Benchtop pH meter for measuring acidity and alkalinity of solutions", "0-14 pH; 0.01 resolution; automatic temperature compensation", "under_maintenance", "active"],
  ["Analytical Balance", "Biology and Chemistry", "Chemistry Laboratory", 5, "Precision electronic balance for accurate weighing of chemical samples", "220g capacity; 0.1mg readability; draft shield", "working", "active"],
  ["UV-Vis Spectrophotometer", "Biology and Chemistry", "Instrumentation Laboratory", 2, "Spectrophotometer for measuring absorbance of solutions across ultraviolet and visible wavelengths", "190-1100nm; 2nm bandwidth; cuvette holder", "working", "active"],
  ["Vernier Caliper Set", "Mechanical Measurement", "Mechanical Workshop", 30, "Stainless steel vernier calipers for length, depth and diameter measurement", "0-150mm range; 0.02mm least count", "working", "active"],
  ["Soldering Station", "Electronics Measurement", "Electronics Laboratory", 12, "Temperature controlled soldering station for assembling and repairing circuit boards", "60W; 200-450 C; ESD safe; spare tips", "working", "active"],
  ["FDM 3D Printer", "Prototyping", "Innovation Prototyping Lab", 2, "FDM 3D printer for rapid prototyping of enclosures and mechanical parts in PLA", "220x220x250mm build volume; PLA/ABS; 0.1mm layer height", "damaged", "active"],
  ["GPU Workstation", "Computing", "AI & Computing Lab", 3, "Desktop GPU workstation for training machine learning and deep learning models", "12GB GPU; 32GB RAM; Ubuntu; CUDA", "working", "active"],
  ["Laboratory Autoclave", "Biology and Chemistry", "Biochemistry Laboratory", 1, "Steam autoclave for sterilising glassware and culture media", "35L chamber; 121 C; 15 psi", "working", "active"],
  ["Top Loading Balance", "Biology and Chemistry", "Chemistry Laboratory", 6, "Top loading electronic balance for general weighing of samples and materials", "5kg capacity; 0.1g readability; tare function", "working", "active"],
];

const seed = async () => {
  try {
    await connectDB();

    // Creator: prefer admin, fall back to any existing user
    let creator = await User.findOne({ role: "admin" });
    if (!creator) creator = await User.findOne();
    if (!creator) {
      console.log("No users found. Run `node scripts/createAdmin.js` first.");
      process.exit(1);
    }

    // Laboratories (idempotent by name)
    const labMap = {};
    for (const [name, department, building, roomNumber] of LABS) {
      let lab = await Laboratory.findOne({ name });
      if (!lab) {
        lab = await Laboratory.create({
          name, department, building, roomNumber,
          description: `${name} — ${department}`,
          createdBy: creator._id,
        });
        console.log(`Created lab: ${name}`);
      }
      labMap[name] = lab;
    }

    // Equipment (idempotent by name + laboratory; backfills location fields)
    let created = 0, skipped = 0, updated = 0;
    let seq = 0;
    for (const [name, category, labName, totalQuantity, description, specText, condition, status] of EQUIPMENT) {
      seq++;
      const lab = labMap[labName];
      if (!lab) continue;
      const locationFields = {
        block: lab.building,
        roomNumber: lab.roomNumber,
        inventoryCode: `EQ-${String(seq).padStart(3, "0")}`
      };
      const exists = await Equipment.findOne({ name, laboratory: lab._id });
      if (exists) {
        const needsUpdate = !exists.block || !exists.inventoryCode;
        if (needsUpdate) {
          await Equipment.updateOne({ _id: exists._id }, {
            $set: {
              block: exists.block || locationFields.block,
              roomNumber: exists.roomNumber || locationFields.roomNumber,
              inventoryCode: exists.inventoryCode || locationFields.inventoryCode
            }
          });
          updated++;
        }
        skipped++;
        continue;
      }
      await Equipment.create({
        name, category, totalQuantity, laboratory: lab._id, description,
        specifications: { Details: specText },
        condition, status, createdBy: creator._id,
        ...locationFields
      });
      created++;
    }

    console.log(`Done. Labs ready: ${Object.keys(labMap).length}. Equipment created: ${created}, updated: ${updated}, skipped (existing): ${skipped}.`);
  } catch (error) {
    console.error("Seed failed:", error.message);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

seed();
