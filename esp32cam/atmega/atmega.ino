/*
 * ATmega (Arduino Mega) — collects GPS, IR, ultrasonic
 * and sends a JSON line to ESP32CAM every second via Serial (UART0).
 *
 * Wiring
 * ──────
 *  GPS (NEO-6M)   → Serial1  pin 18 (RX1), 19 (TX1)
 *  ESP32CAM       → Serial   pin  0 (RX0),  1 (TX0)
 *                   ATmega TX0 (pin 1) → ESP32CAM GPIO13
 *                   Common GND
 *  IR sensor      → pin 8  (LOW = triggered)
 *  HC-SR04 TRIG   → pin 9
 *  HC-SR04 ECHO   → pin 10
 *
 * Libraries (install via Arduino Library Manager)
 * ─────────────────────────────────────────────────
 *  TinyGPSPlus  by Mikal Hart
 */

#include <TinyGPSPlus.h>

#define IR_PIN    8
#define TRIG_PIN  9
#define ECHO_PIN  10

TinyGPSPlus gps;

float readUltrasonic() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return -1.0;
  return (dur * 0.343f) / 2.0f;  // mm
}

void sendJSON() {
  bool hasGPS = gps.location.isValid() && gps.location.age() < 2000;
  float lat  = hasGPS ? (float)gps.location.lat() : 0.0f;
  float lng  = hasGPS ? (float)gps.location.lng() : 0.0f;
  float acc  = (hasGPS && gps.hdop.isValid()) ? gps.hdop.value() * 5.0f : -1.0f;
  bool  ir   = (digitalRead(IR_PIN) == LOW);
  float ult  = readUltrasonic();

  Serial.print(F("{"));

  if (hasGPS) {
    Serial.print(F("\"lat\":")); Serial.print(lat, 6); Serial.print(F(","));
    Serial.print(F("\"lng\":")); Serial.print(lng, 6); Serial.print(F(","));
  } else {
    Serial.print(F("\"lat\":null,\"lng\":null,"));
  }

  if (acc > 0) {
    Serial.print(F("\"gps_accuracy_m\":")); Serial.print(acc, 1); Serial.print(F(","));
  } else {
    Serial.print(F("\"gps_accuracy_m\":null,"));
  }

  Serial.print(F("\"ir_triggered\":")); Serial.print(ir ? F("true") : F("false")); Serial.print(F(","));

  if (ult > 0) {
    Serial.print(F("\"ultrasonic_mm\":")); Serial.print(ult, 1);
  } else {
    Serial.print(F("\"ultrasonic_mm\":null"));
  }

  Serial.println(F("}"));
}

void setup() {
  Serial.begin(9600);   // → ESP32CAM
  Serial1.begin(9600);  // ← GPS

  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  unsigned long start = millis();
  while (millis() - start < 800) {
    while (Serial1.available()) gps.encode(Serial1.read());
  }

  sendJSON();
  delay(200);
}
