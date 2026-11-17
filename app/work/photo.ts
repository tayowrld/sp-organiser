export async function readPhoto(file: File) {
  if (!file.size) return undefined
  if (file.size > 20 * 1024 * 1024) throw new Error('Исходная фотография должна быть меньше 20 МБ')
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new Error('Выберите файл фотографии')
  const source = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Не удалось открыть фотографию. Попробуйте другое изображение.'))
      element.src = source
    })
    let result: Blob | null = null
    for (const maximum of [1920, 1280, 960]) {
      const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Браузер не смог обработать фотографию')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .84))
      if (result && result.size <= 4 * 1024 * 1024) break
    }
    if (!result || result.size > 4 * 1024 * 1024) throw new Error('Не удалось уменьшить фотографию до 4 МБ')
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Не удалось прочитать фотографию'))
      reader.readAsDataURL(result!)
    })
  } finally {
    URL.revokeObjectURL(source)
  }
}
