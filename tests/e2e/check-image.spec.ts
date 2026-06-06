import { test } from "@playwright/test";
import fs from "fs";

test("check screenshot pixel colors", async ({ page }) => {
  // Load settings_before.png in browser using a data URI or canvas
  const imgPath = "/Users/trevor/.gemini/antigravity-cli/brain/f38d965f-dd50-4365-81f9-a65308c0b216/settings_before.png";
  if (!fs.existsSync(imgPath)) {
    console.error("Screenshot does not exist!");
    return;
  }

  const base64 = fs.readFileSync(imgPath).toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  await page.goto("about:blank");
  await page.evaluate((src) => {
    const img = document.createElement("img");
    img.src = src;
    img.id = "screenshot";
    document.body.appendChild(img);
  }, dataUri);

  // Wait for image to load
  await page.waitForSelector("#screenshot");

  // Analyze pixel colors using a canvas
  const colors = await page.evaluate(() => {
    const img = document.getElementById("screenshot") as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);

    // Let's sample a grid of pixels or find the yellow buttons
    // The image width is likely 1280.
    // Let's find columns where there is yellow: rgb(240, 195, 73)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const yellowPixels: { x: number; y: number; r: number; g: number; b: number }[] = [];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Match yellow-ish color
        if (r > 200 && g > 160 && b < 100) {
          yellowPixels.push({ x, y, r, g, b });
        }
      }
    }

    // Group yellow pixels by y-coordinate clusters to find the three buttons
    // Since buttons are spaced vertically, we can cluster them by y
    const clusters: typeof yellowPixels[] = [];
    let currentCluster: typeof yellowPixels = [];
    let lastY = -1;

    // Sort by Y first
    yellowPixels.sort((a, b) => a.y - b.y);

    for (const p of yellowPixels) {
      if (lastY === -1 || p.y - lastY <= 15) {
        currentCluster.push(p);
      } else {
        if (currentCluster.length > 50) {
          clusters.push(currentCluster);
        }
        currentCluster = [p];
      }
      lastY = p.y;
    }
    if (currentCluster.length > 50) {
      clusters.push(currentCluster);
    }

    // For each cluster, find the average/representative color
    return clusters.map((cluster, i) => {
      let sumR = 0, sumG = 0, sumB = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of cluster) {
        sumR += p.r;
        sumG += p.g;
        sumB += p.b;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return {
        id: i,
        count: cluster.length,
        avgColor: `rgb(${Math.round(sumR / cluster.length)}, ${Math.round(sumG / cluster.length)}, ${Math.round(sumB / cluster.length)})`,
        bounds: { minX, maxX, minY, maxY }
      };
    });
  });

  console.log("YELLOW BUTTONS IN SCREENSHOT:");
  console.log(JSON.stringify(colors, null, 2));
});
