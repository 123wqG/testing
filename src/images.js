export async function prepareImage(file) {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error(
      `${file.name}：请使用 JPG、PNG、WebP 或 GIF 图片。HEIC 请先转换。`,
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error(`${file.name} 超过 20MB，请先缩小文件。`);
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 640 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!thumbnail) throw new Error("生成预览失败");
    return { file, thumbnail, url: URL.createObjectURL(file) };
  } finally {
    image.close();
  }
}
