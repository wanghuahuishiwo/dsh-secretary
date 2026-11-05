import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator, writeWorkspaceArtifacts } from '@deepseek-ai/dsh-typert-generator'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = new WorkspaceTypertGenerator(root, { rejectBuildOutputs: true }).generateContributors(['host'])
writeWorkspaceArtifacts(root, artifacts)
for (const artifact of artifacts) {
  console.log(`generate:typert: ${artifact.package} (${artifact.face})`)
}
