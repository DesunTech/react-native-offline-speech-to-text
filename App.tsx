/**
 * VoiceToTextScreen Component
 *
 * This component provides a user interface for recording audio, transcribing it to text,
 * and playing back the recorded audio. It utilizes react-native-audio-record for audio recording,
 * whisper.rn for speech-to-text transcription, and react-native-sound for audio playback.
 *
 * Features:
 * - Audio recording with permissions handling
 * - Speech-to-text transcription using Whisper
 * - Audio playback of recorded files
 * - Debug logging for development purposes
 *
 * The component manages various states including:
 * - Recording state
 * - Transcription text
 * - Audio processing state
 * - Audio file information
 * - Playback state
 *
 * It also handles file operations such as saving and deleting audio files,
 * and provides a user interface for controlling these operations.
 *
 * @returns {React.ReactElement} The rendered VoiceToTextScreen component
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  ScrollView,
} from 'react-native';
import AudioRecord from 'react-native-audio-record';
import RNFS from 'react-native-fs';
import {initWhisper} from 'whisper.rn';
import Sound from 'react-native-sound';

// Global variables for Whisper and Sound instances
let Whisper;
let sound;

export default function VoiceToTextScreen() {
  // State variables for managing recording, transcription, and UI states
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);

  // useEffect hook for initial setup
  useEffect(() => {
    setupAudioRecord();
    initWhispers();
    return () => {
      // Cleanup function to release sound resources
      if (sound) {
        sound.release();
      }
    };
  }, []);

  // Function to add debug logs
  const addDebugLog = message => {
    setDebugLogs(prevLogs => [...prevLogs, message]);
  };

  // Function to set up audio recording
  async function setupAudioRecord() {
    if (Platform.OS === 'android') {
      await requestMicrophonePermission();
    }

    const options = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      wavFile: 'test.wav',
    };

    AudioRecord.init(options);
    addDebugLog('Audio Record initialized');
  }

  // Function to request microphone permission on Android
  async function requestMicrophonePermission() {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'App needs access to your microphone to transcribe audio.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        addDebugLog('Microphone permission denied');
      } else {
        addDebugLog('Microphone permission granted');
      }
    } catch (err) {
      addDebugLog('Error requesting microphone permission: ' + err.message);
    }
  }

  // Function to initialize Whisper
  async function initWhispers() {
    addDebugLog('Initializing Whisper...');
    try {
      const modelFileName = 'ggml-base.bin';
      const modelPath = `${RNFS.DocumentDirectoryPath}/${modelFileName}`;
      const modelExists = await RNFS.exists(modelPath);
      addDebugLog('Model exists: ' + modelExists);
      addDebugLog('Model path: ' + modelPath);

      // Copy model file if it doesn't exist
      if (!modelExists) {
        if (Platform.OS === 'android') {
          await RNFS.copyFileAssets(modelFileName, modelPath);
        } else {
          const bundlePath = RNFS.MainBundlePath;
          await RNFS.copyFile(`${bundlePath}/${modelFileName}`, modelPath);
        }
        addDebugLog('Model file copied');
      }

      // Initialize Whisper
      Whisper = await initWhisper({
        filePath: modelPath,
      });

      if (!Whisper || typeof Whisper.transcribe !== 'function') {
        throw new Error('Whisper not properly initialized');
      }
      addDebugLog('Whisper object: ' + JSON.stringify(Whisper));
      addDebugLog('Whisper initialized successfully');
    } catch (error) {
      addDebugLog('Failed to initialize Whisper: ' + error.message);
    }
  }

  // Function to start audio recording
  async function startRecording() {
    setIsRecording(true);
    AudioRecord.start();
    addDebugLog('Started recording');
  }

  // Function to stop audio recording and save the file
  async function stopRecording() {
    setIsRecording(false);
    const audio = await AudioRecord.stop();
    addDebugLog('Stopped recording');
    const fileName = `recording_${Date.now()}.wav`;
    const filePath = `${RNFS.ExternalDirectoryPath}/${fileName}`;
    try {
      await RNFS.moveFile(audio, filePath);
      setAudioFile(filePath);
      addDebugLog('Audio file saved: ' + filePath);
      addDebugLog(
        'Audio file size: ' + (await RNFS.stat(filePath)).size + ' bytes',
      );
      processAudio(filePath);
    } catch (error) {
      addDebugLog('Error saving audio file: ' + error.message);
    }
  }

  // Function to process audio and transcribe it
  async function processAudio(audio) {
    setIsProcessing(true);
    addDebugLog('Processing audio...');
    try {
      if (!Whisper) {
        throw new Error('Whisper not initialized');
      }
      addDebugLog('Starting transcription...');
      const options = {language: 'hi'};
      const result = await Whisper.transcribe(audio, options);
      addDebugLog('Raw transcription result: ' + JSON.stringify(result));

      // Handle different result formats
      if (result && typeof result === 'object' && result.promise) {
        // If result is a Promise, wait for it to resolve
        const transcriptionResult = await result.promise;
        addDebugLog(
          'Resolved transcription result: ' +
            JSON.stringify(transcriptionResult),
        );

        if (transcriptionResult && transcriptionResult.result) {
          setTranscription(transcriptionResult.result);
        } else if (
          transcriptionResult &&
          transcriptionResult.segments &&
          transcriptionResult.segments.length > 0
        ) {
          const fullText = transcriptionResult.segments
            .map(segment => segment.text)
            .join(' ');
          setTranscription(fullText);
        } else {
          throw new Error('No transcription text in resolved result');
        }
      } else if (result && result.text) {
        // If result already contains the text
        setTranscription(result.text);
      } else {
        throw new Error('Unexpected transcription result format');
      }
    } catch (error) {
      addDebugLog('Error processing audio: ' + error.message);
      setTranscription('Error processing audio: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  }

  // Function to play the recorded audio
  function playAudio() {
    if (audioFile) {
      sound = new Sound(audioFile, '', error => {
        if (error) {
          addDebugLog('Failed to load the sound: ' + error.message);
          return;
        }
        setAudioDuration(sound.getDuration());
        setIsPlaying(true);
        sound.play(success => {
          if (success) {
            addDebugLog('Successfully finished playing');
            setIsPlaying(false);
          } else {
            addDebugLog('Playback failed due to audio decoding errors');
          }
        });
      });
    }
  }

  // Function to stop audio playback
  function stopAudio() {
    if (sound) {
      sound.stop(() => {
        setIsPlaying(false);
      });
    }
  }

  // Function to delete the recorded audio file
  async function deleteAudio() {
    if (audioFile) {
      try {
        await RNFS.unlink(audioFile);
        setAudioFile(null);
        setTranscription('');
        setAudioDuration(0);
        addDebugLog('Audio file deleted successfully');
      } catch (error) {
        addDebugLog('Error deleting audio file: ' + error.message);
      }
    }
  }

  // Render the UI
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
      <Button
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        onPress={isRecording ? stopRecording : startRecording}
      />
      {isProcessing && <Text>Processing audio...</Text>}
      <Text style={{marginTop: 20}}>Transcription: {transcription}</Text>
      {audioFile && (
        <View>
          <Text>File location: {audioFile}</Text>
          <Text>Audio duration: {audioDuration.toFixed(2)} seconds</Text>
          {isPlaying ? (
            <Button title="Stop Playing" onPress={stopAudio} />
          ) : (
            <Button title="Play Recorded Audio" onPress={playAudio} />
          )}
          {isPlaying && <Text>Audio is playing...</Text>}
          <Button title="Delete Audio File" onPress={deleteAudio} color="red" />
        </View>
      )}
      <View
        style={{
          marginTop: 20,
          padding: 10,
          backgroundColor: '#f0f0f0',
          width: '100%',
        }}>
        <Text style={{fontWeight: 'bold'}}>Debug Logs:</Text>
        {debugLogs.map((log, index) => (
          <Text key={index}>{log}</Text>
        ))}
      </View>
    </ScrollView>
  );
}
