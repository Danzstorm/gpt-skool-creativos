/**
 * Cuándo el textarea del composer se apaga. A propósito NO recibe
 * `isUploading` ni `isUploadingVideo`: enviar espera al adjunto, escribir no.
 */
export function composerFieldDisabled(state: {
  isLoading: boolean;
  isTranscribing: boolean;
}): boolean {
  return state.isLoading || state.isTranscribing;
}
