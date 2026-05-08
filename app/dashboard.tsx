import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { FloatingRecommendationCard } from '@/components/FloatingRecommendationCard';
import { runConcentrationInference } from '@/lib/audio/audioAnalyzer';

type Label = 'Favorable' | 'Moderado' | 'No Favorable';

function getRecommendation(label: Label) {
  if (label === 'Favorable') {
    return {
      title: 'Entorno Optimo',
      description: 'Silencio altamente estable. Continúa con ciclos de enfoque profundo.',
    };
  }
  if (label === 'Moderado') {
    return {
      title: 'Ruido Moderado',
      description: 'Ambiente aceptable. Usa auriculares o reduce distracciones.',
    };
  }
  return {
    title: 'Entorno No Favorable',
    description: 'Cambia de sala o activa cancelación de ruido para mejores resultados.',
  };
}

function getStatusColor(label: Label) {
  if (label === 'Favorable') return '#33d17a';
  if (label === 'Moderado') return '#f3c44f';
  return '#ff5f73';
}

const waveBases = [0.4, 0.65, 0.55, 1, 0.58, 0.76, 0.5];

export default function DashboardScreen() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 100);
  const [status, setStatus] = useState('Listo para capturar muestra');
  const [label, setLabel] = useState<Label>('Moderado');
  const [metrics, setMetrics] = useState({ rms: 0, zcr: 0, score: 0, analyzedSeconds: 0 });
  const maxMetering = useRef(0);
  const normalizeMeterValue = (lvl?: number): number => {
    if (typeof lvl !== 'number' || !Number.isFinite(lvl)) return 0;
    if (lvl === 0) return 0;
    if (lvl < 0) {
      const linear = Math.pow(10, lvl / 20);
      return Math.min(1, Math.max(0, linear));
    }
    if (lvl > 0 && lvl <= 1) return Math.min(1, lvl);
    if (lvl > 1 && lvl <= 100) return Math.min(1, lvl / 100);
    return Math.min(1, lvl / 32768);
  };
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const rawMeter = typeof recorderState.metering === 'number' ? recorderState.metering : NaN;
    if (recorderState.isRecording) {
      const normalized = Number.isFinite(rawMeter) ? normalizeMeterValue(rawMeter) : 0;
      maxMetering.current = Math.max(maxMetering.current, normalized);
      console.log('[AudioDebug] recorderState.isRecording=true duration=', recorderState.durationMillis, 'metering=', rawMeter, 'normalizedMeter=', normalized, 'maxNormalized=', maxMetering.current);
    } else {
      console.log('[AudioDebug] recorderState.isRecording=false duration=', recorderState.durationMillis, 'metering=', rawMeter);
    }
  }, [recorderState.isRecording, recorderState.metering, recorderState.durationMillis]);

  const statusColor = useMemo(() => getStatusColor(label), [label]);
  const recommendation = useMemo(() => getRecommendation(label), [label]);

  useEffect(() => {
    const waveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const buttonLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonAnim, {
          toValue: 1.08,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(buttonAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    if (recorderState.isRecording) {
      waveLoop.start();
      pulseLoop.start();
      buttonLoop.start();
    } else {
      waveAnim.stopAnimation();
      pulseAnim.stopAnimation();
      buttonAnim.stopAnimation();
      waveAnim.setValue(0);
      pulseAnim.setValue(1);
      buttonAnim.setValue(1);
    }

    return () => {
      waveLoop.stop();
      pulseLoop.stop();
      buttonLoop.stop();
    };
  }, [pulseAnim, waveAnim, buttonAnim, recorderState.isRecording]);

  const startRecording = async () => {
    try {
      setStatus('Solicitando permisos...');
      const permission = await requestRecordingPermissionsAsync();
      console.log('[AudioDebug] permission=', permission);
      if (!permission.granted) {
        setStatus('Permiso de micrófono denegado.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      console.log('[AudioDebug] recorder status after prepare=', recorder.getStatus());
      maxMetering.current = 0;
      await recorder.record();
      console.log('[AudioDebug] recorder started, status=', recorder.getStatus());
      setStatus('Grabando muestra...');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      setStatus(`No se pudo iniciar la grabación: ${message}`);
    }
  };

  const stopAndAnalyze = async () => {
    if (!recorderState.isRecording) {
      return;
    }
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const finalStatus = recorder.getStatus();
      console.log('[AudioDebug] finalStatusFull=', finalStatus);

      if (!uri) {
        setStatus('No se encontró audio para analizar.');
        return;
      }

      // Check file existence and size to guarantee the recorder actually wrote audio
      let fileInfo: { exists?: boolean; size?: number } | null = null;
      try {
        fileInfo = await FileSystem.getInfoAsync(uri);
        console.log('[AudioDebug] fileInfo=', fileInfo);
        setStatus(`Archivo guardado: ${fileInfo.size ?? 0} bytes`);
        if (!fileInfo.exists || (fileInfo.size ?? 0) === 0) {
          setStatus('Archivo de audio vacío (0 bytes). Revisa permisos y vuelve a intentar.');
          return;
        }
      } catch (err) {
        console.log('[AudioDebug] getInfoAsync fallo', err);
      }

      setStatus('Procesando características...');
      const rawFinal = typeof finalStatus.metering === 'number' ? finalStatus.metering : NaN;
      const normalizedFinal = Number.isFinite(rawFinal) ? normalizeMeterValue(rawFinal) : 0;
      const normalizedMax = normalizeMeterValue(maxMetering.current);
      const fallbackNormalized = Math.max(normalizedFinal, normalizedMax);
      console.log(
        '[AudioDebug] finalStatus.metering=',
        finalStatus.metering,
        'normalizedFinal=',
        normalizedFinal,
        'maxMetering=',
        maxMetering.current,
        'normalizedMax=',
        normalizedMax,
        'fallbackNormalized=',
        fallbackNormalized
      );

      const result = await runConcentrationInference(uri, undefined, fallbackNormalized);
      setLabel(result.label);
      setMetrics({
        rms: result.features.rms,
        zcr: result.features.zcr,
        score: result.score,
        analyzedSeconds:
          result.features.analyzedSeconds || recorderState.durationMillis / 1000 || 0,
      });
      setStatus('Análisis completado');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      setStatus(`Fallo durante el análisis de audio: ${message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.heading}>ClearSpace</Text>
          </View>
          <Pressable onPress={() => router.replace('/login')} style={styles.logoutButton}>
            <Text style={styles.logout}>Salir</Text>
          </Pressable>
        </View>

        <View style={[styles.heroCard, { borderColor: statusColor }]}> 
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusLabel}>{label}</Text>
          </View>
          <Text style={styles.heroTitle}>Audio Sampling Activo</Text>

          <View style={styles.waveWrapper}>
            <View style={[styles.waveGlow, { shadowColor: statusColor }]} />
            <View style={styles.waveContainer}>
              {waveBases.map((base, index) => {
                const scaleY = waveAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [base, base * 1.25, base],
                });

                return (
                  <Animated.View
                    key={`${index}`}
                    style={[
                      styles.waveBar,
                      {
                        transform: [{ scaleY }],
                        opacity: recorderState.isRecording ? 1 : 0.35,
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          <Animated.View style={[styles.pulseButtonRing, { transform: [{ scale: buttonAnim }], borderColor: statusColor }]}> 
            <Pressable style={styles.pulseButton} onPress={recorderState.isRecording ? stopAndAnalyze : startRecording}>
              <Animated.View style={[styles.pulseCore, { backgroundColor: statusColor, transform: [{ scale: pulseAnim }] }]} />
            </Pressable>
          </Animated.View>

          <Text style={styles.buttonHint}>{recorderState.isRecording ? 'Grabando ahora' : 'Toca para iniciar la muestra'}</Text>
        </View>

        <View style={styles.metricsCard}>
          <View style={styles.metricsRow}>
            <View>
              <Text style={styles.metricLabel}>RMS</Text>
              <Text style={styles.metricValue}>{metrics.rms.toFixed(4)}</Text>
            </View>
            <View>
              <Text style={styles.metricLabel}>ZCR</Text>
              <Text style={styles.metricValue}>{metrics.zcr.toFixed(4)}</Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <View>
              <Text style={styles.metricLabel}>Duración</Text>
              <Text style={styles.metricValue}>{metrics.analyzedSeconds.toFixed(2)} s</Text>
            </View>
            <View>
              <Text style={styles.metricLabel}>Score</Text>
              <Text style={styles.metricValue}>{(metrics.score * 100).toFixed(1)}%</Text>
            </View>
          </View>
          <Text style={styles.statusText}>{status}</Text>
        </View>



        <FloatingRecommendationCard title={recommendation.title} description={recommendation.description} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#04030c',
  },
  content: {
    padding: 20,
    gap: 22,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  heading: {
    color: '#f8f9ff',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 28,
  },
  subheading: {
    color: '#9aa1ba',
    marginTop: 4,
    fontSize: 13,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#111421',
  },
  logout: {
    color: '#8fa1cc',
    fontWeight: '600',
    fontSize: 13,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: '#090b14',
    padding: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 14 },
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#fff',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  statusLabel: {
    color: '#d7d7ef',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#f7f7ff',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 60,
  },
  heroDescription: {
    color: '#9aa1ba',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 28,
  },
  waveWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 190,
    marginBottom: 48,
  },
  waveGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(66, 135, 245, 0.08)',
    zIndex: 0,
  },
  waveContainer: {
    width: '100%',
    maxWidth: 260,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 1,
    paddingHorizontal: 10,
    height: 140,
  },
  waveBar: {
    width: 14,
    height: 130,
    borderRadius: 999,
    backgroundColor: '#5e72ff',
    shadowColor: '#5e72ff',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  pulseButtonRing: {
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 80,
    width: 156,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 18,
  },
  pulseButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#0c0f1a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  pulseCore: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  buttonHint: {
    color: '#8f98b4',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  metricsCard: {
    borderRadius: 24,
    backgroundColor: '#080a12',
    borderWidth: 1,
    borderColor: '#141821',
    padding: 20,
    gap: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  metricLabel: {
    color: '#7c86a0',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  metricValue: {
    color: '#f6f7ff',
    fontSize: 18,
    fontWeight: '700',
  },
  statusText: {
    color: '#9da5c5',
    fontSize: 13,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111625',
    borderWidth: 1,
    borderColor: '#1b2032',
  },
  actionButtonPrimary: {
    backgroundColor: '#272f5b',
    borderColor: '#3d4a8e',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionText: {
    color: '#d7dbe8',
    fontSize: 15,
    fontWeight: '700',
  },
  actionTextPrimary: {
    color: '#e5e9ff',
  },
  actionTextDisabled: {
    color: '#7a8298',}
  })
