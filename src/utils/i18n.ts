const dictionary: Record<string, string> = {
  // Process types / classes
  Applizieren: 'Applying',
  Drucken: 'Printing',
  Bereitstellen: 'Preparing',
  Manipulieren: 'Manipulating',
  Versetzen: 'Positioning',
  Hauptprozess: 'Main Process',
  Teilprozess: 'Sub-Process',

  // Process names
  'Etikett applizieren': 'Apply label',
  'Etikett drucken und bereitstellen': 'Print and prepare label',
  'Etikett aufnehmen und manipulieren': 'Pick up and manipulate label',
  'Versatz ermitteln': 'Determine offset',

  // Categories / components
  Roboter: 'Robot',
  Kamera: 'Camera',
  Etikettendrucker: 'Label Printer',
  Roboterfunktion: 'Robot Function',
  Vision: 'Vision',
  'Vision-Job': 'Vision Job',
  Software: 'Software',
  SPS: 'PLC',

  // UI sections
  Baukasten: 'Modular System',
  'Baukasten (Modular System)': 'Modular System',
};

export function translateLabel(text?: string): string {
  if (!text) return '';
  return dictionary[text] ?? text;
}

export function toCanonicalKeyword(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  const map: Record<string, string> = {
    applizieren: 'applying',
    applying: 'applying',
    drucken: 'printing',
    printing: 'printing',
    bereitstellen: 'preparing',
    preparing: 'preparing',
    manipulieren: 'manipulating',
    manipulating: 'manipulating',
    versetzen: 'positioning',
    positioning: 'positioning',
    roboter: 'robot',
    robot: 'robot',
    kamera: 'camera',
    camera: 'camera',
  };
  return map[k] ?? k;
}

