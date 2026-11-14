import { dataPath, readJson, writeJson } from '../store.ts'
import { withLesson, type Lesson } from './lessons.ts'

/** Kalıcı hafızanın dosyası (userData/agent-memory.json); kural `lessons.ts`te. */
const file = () => dataPath('agent-memory.json')

export const lessons = () => readJson<Lesson[]>(file(), [])

export function saveLesson(text: string): Lesson {
  const { list, lesson } = withLesson(lessons(), text)
  writeJson(file(), list)
  return lesson
}

export function deleteLesson(id: string): boolean {
  const list = lessons()
  const rest = list.filter((l) => l.id !== id)
  if (rest.length !== list.length) writeJson(file(), rest)
  return rest.length !== list.length
}
