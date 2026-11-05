export function cronsEnabled(): boolean {
  return process.env.CRONS_ENABLED?.trim().toLowerCase() !== 'false'
}
