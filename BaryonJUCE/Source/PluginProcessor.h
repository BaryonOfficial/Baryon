/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin processor.

  ==============================================================================
*/

#pragma once

#include <JuceHeader.h>

//==============================================================================
/**
*/
class BaryonJUCEAudioProcessor : public juce::AudioProcessor
{
public:
    //==============================================================================
    BaryonJUCEAudioProcessor();
    ~BaryonJUCEAudioProcessor() override;

    //==============================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

   #ifndef JucePlugin_PreferredChannelConfigurations
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
   #endif

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==============================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    //==============================================================================
    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    //==============================================================================
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    //==============================================================================
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // Audio analysis methods
    const float* getFFTData() const { return fftData.data(); }
    float getAverageAmplitude() const { return averageAmplitude; }
    const juce::dsp::FFT& getFFT() const { return fft; }
    int getFFTSize() const { return fftSize; }
    double getCurrentSampleRate() const { return lastSampleRate; }
    bool isPlaying() const { return playing; }
    bool isInputConnected() const { return inputConnected; }

private:
    // FFT and analysis
    static constexpr int fftOrder = 12;  // 4096 points
    static constexpr int fftSize = 1 << fftOrder;
    juce::dsp::FFT fft { fftOrder };
    juce::dsp::WindowingFunction<float> window { fftSize, juce::dsp::WindowingFunction<float>::hann };
    std::vector<float> fftData { fftSize * 2, 0.0f };  // Real and imaginary parts
    std::vector<float> fifo { fftSize, 0.0f };
    int fifoIndex = 0;
    float averageAmplitude = 0.0f;
    bool nextFFTBlockReady = false;
    double lastSampleRate = 44100.0;
    bool playing = false;
    bool inputConnected = false;

    void pushNextSampleIntoFifo(float sample) noexcept;
    void updateFFTData();
    void checkForInputConnection();

    //==============================================================================
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BaryonJUCEAudioProcessor)
};
