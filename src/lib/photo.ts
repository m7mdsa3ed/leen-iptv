/** Centre-crops an image file to a 160px square JPEG data URL (about 8 KB), small enough to live in the profile and sync with it. */
export async function photoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const S = 160
    const c = document.createElement("canvas")
    c.width = c.height = S
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S)
    return c.toDataURL("image/jpeg", 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
