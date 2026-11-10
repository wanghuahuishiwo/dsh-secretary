export const OUTPUT = {
  schema: { type: 'object' },
  render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
}

export function noConfig(vendor: string) {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate(raw: unknown) {
        if (raw === undefined || (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && Object.keys(raw).length === 0)) {
          return { value: {} }
        }
        return { issues: [{ message: 'secretary: this plugin does not accept config fields' }] }
      },
    },
  }
}
