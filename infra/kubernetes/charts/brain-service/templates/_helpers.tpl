{{- define "brain-service.name" -}}{{ .Values.name }}{{- end -}}
{{- define "brain-service.labels" -}}
app.kubernetes.io/name: {{ .Values.name }}
app.kubernetes.io/part-of: brain
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "brain-service.selector" -}}
app.kubernetes.io/name: {{ .Values.name }}
{{- end -}}
