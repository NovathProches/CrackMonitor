#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ── Config ────────────────────────────────────────────────────────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#define CV_SERVICE_URL  "http://YOUR_PC_LOCAL_IP:8000/detections"
#define DEVICE_TOKEN    "test-device-001"

#define CAPTURE_INTERVAL_MS  10000

// ── ATmega serial (Serial1 on GPIO13=RX, GPIO15=TX) ──────────────────────────
// Wire: ATmega TX → ESP32CAM GPIO13
//       ATmega RX → ESP32CAM GPIO15
//       Common GND
#define ATMEGA_RX 13
#define ATMEGA_TX 15

// ── AI-Thinker ESP32-CAM pin map ──────────────────────────────────────────────
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22

static const char* BOUNDARY = "----ESP32Boundary7MA4YWxkTrZu0gW";

// ── ATmega data ───────────────────────────────────────────────────────────────

struct AtmegaData {
  float lat           = 0.0;
  float lng           = 0.0;
  float gps_accuracy  = -1.0;
  bool  ir_triggered  = false;
  float ultrasonic_mm = -1.0;
};

AtmegaData lastAtmega;

// Read one JSON line from ATmega (non-blocking, 200 ms timeout)
bool readAtmega(AtmegaData& out) {
  String line = "";
  unsigned long t = millis();
  while (millis() - t < 200) {
    while (Serial1.available()) {
      char c = Serial1.read();
      if (c == '\n') goto parse;
      if (c != '\r') line += c;
    }
  }
  return false;

parse:
  if (line.length() < 5) return false;
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, line)) return false;

  out.lat           = doc["lat"]            | 0.0f;
  out.lng           = doc["lng"]            | 0.0f;
  out.gps_accuracy  = doc["gps_accuracy_m"] | -1.0f;
  out.ir_triggered  = doc["ir_triggered"]   | false;
  out.ultrasonic_mm = doc["ultrasonic_mm"]  | -1.0f;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String isoNow() {
  time_t now;
  struct tm t;
  time(&now);
  gmtime_r(&now, &t);
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

String buildMetadata(const AtmegaData& a, const String& imagePath) {
  StaticJsonDocument<512> doc;
  doc["device_token"] = DEVICE_TOKEN;
  doc["timestamp"]    = isoNow();
  doc["image_path"]   = imagePath;

  if (a.lat != 0.0 || a.lng != 0.0) {
    doc["lat"] = a.lat;
    doc["lng"] = a.lng;
  } else {
    doc["lat"] = nullptr;
    doc["lng"] = nullptr;
  }

  if (a.gps_accuracy > 0) doc["gps_accuracy_m"] = a.gps_accuracy;
  else                     doc["gps_accuracy_m"] = nullptr;

  doc["ir_triggered"] = a.ir_triggered;

  if (a.ultrasonic_mm > 0) doc["ultrasonic_mm"] = a.ultrasonic_mm;
  else                      doc["ultrasonic_mm"] = nullptr;

  String out;
  serializeJson(doc, out);
  return out;
}

// ── Camera init ───────────────────────────────────────────────────────────────

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_VGA;
  config.jpeg_quality = 10;
  config.fb_count     = 1;

  return esp_camera_init(&config) == ESP_OK;
}

// ── POST multipart/form-data ──────────────────────────────────────────────────

bool sendDetection(camera_fb_t* fb, const AtmegaData& a) {
  // Generate filename: images/YYYY-MM-DD_HH-MM-SS.jpg
  time_t now; time(&now);
  struct tm t; gmtime_r(&now, &t);
  char fname[40];
  strftime(fname, sizeof(fname), "images/%Y-%m-%d_%H-%M-%S.jpg", &t);

  HTTPClient http;
  http.begin(CV_SERVICE_URL);

  String contentType = "multipart/form-data; boundary=";
  contentType += BOUNDARY;
  http.addHeader("Content-Type", contentType);

  String meta = buildMetadata(a, String(fname));

  String prefix = "--";
  prefix += BOUNDARY;
  prefix += "\r\nContent-Disposition: form-data; name=\"metadata\"\r\n\r\n";
  prefix += meta;
  prefix += "\r\n--";
  prefix += BOUNDARY;
  prefix += "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"crack.jpg\"\r\n";
  prefix += "Content-Type: image/jpeg\r\n\r\n";

  String suffix = "\r\n--";
  suffix += BOUNDARY;
  suffix += "--\r\n";

  size_t totalLen = prefix.length() + fb->len + suffix.length();
  http.addHeader("Content-Length", String(totalLen));

  WiFiClient* stream = http.getStreamPtr();
  stream->print(prefix);
  stream->write(fb->buf, fb->len);
  stream->print(suffix);

  int code = http.POST((uint8_t*)nullptr, 0);
  String body = http.getString();
  http.end();

  Serial.printf("HTTP %d: %s\n", code, body.c_str());
  return code == 201;
}

// ── Setup / loop ──────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial1.begin(9600, SERIAL_8N1, ATMEGA_RX, ATMEGA_TX);

  if (!initCamera()) {
    Serial.println("Camera init failed — halting");
    while (true) delay(1000);
  }
  Serial.println("Camera ready");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nConnected: %s\n", WiFi.localIP().toString().c_str());

  configTime(0, 0, "pool.ntp.org");
  Serial.print("Syncing time");
  time_t now = 0;
  while (now < 1000000000) {
    delay(500);
    Serial.print(".");
    time(&now);
  }
  Serial.println("\nTime synced");
}

void loop() {
  // Pull latest data from ATmega
  AtmegaData atmega;
  if (readAtmega(atmega)) {
    lastAtmega = atmega;
    Serial.printf("ATmega: lat=%.4f lng=%.4f ir=%d ult=%.1f\n",
      atmega.lat, atmega.lng, atmega.ir_triggered, atmega.ultrasonic_mm);
  } else {
    Serial.println("ATmega: no data (using last)");
  }

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Capture failed");
    delay(2000);
    return;
  }

  Serial.printf("Captured %u bytes — sending…\n", fb->len);
  sendDetection(fb, lastAtmega);
  esp_camera_fb_return(fb);

  delay(CAPTURE_INTERVAL_MS);
}
