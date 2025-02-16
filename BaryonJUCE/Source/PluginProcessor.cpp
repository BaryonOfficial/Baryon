/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin processor.

  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
BaryonJUCEAudioProcessor::BaryonJUCEAudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
     : AudioProcessor (BusesProperties()
                     #if ! JucePlugin_IsMidiEffect
                      #if ! JucePlugin_IsSynth
                       .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                      #endif
                       .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                     #endif
                       )
#endif
{
    checkForInputConnection();
}

BaryonJUCEAudioProcessor::~BaryonJUCEAudioProcessor()
{
}

void BaryonJUCEAudioProcessor::checkForInputConnection()
{
    if (auto* playHead = getPlayHead())
    {
        juce::AudioPlayHead::CurrentPositionInfo posInfo;
        playHead->getCurrentPosition(posInfo);
        playing = posInfo.isPlaying;
    }
    
    auto numInputChannels = getTotalNumInputChannels();
    inputConnected = numInputChannels > 0;
}

//==============================================================================
const juce::String BaryonJUCEAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool BaryonJUCEAudioProcessor::acceptsMidi() const
{
   #if JucePlugin_WantsMidiInput
    return true;
   #else
    return false;
   #endif
}

bool BaryonJUCEAudioProcessor::producesMidi() const
{
   #if JucePlugin_ProducesMidiOutput
    return true;
   #else
    return false;
   #endif
}

bool BaryonJUCEAudioProcessor::isMidiEffect() const
{
   #if JucePlugin_IsMidiEffect
    return true;
   #else
    return false;
   #endif
}

double BaryonJUCEAudioProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int BaryonJUCEAudioProcessor::getNumPrograms()
{
    return 1;   // NB: some hosts don't cope very well if you tell them there are 0 programs,
                // so this should be at least 1, even if you're not really implementing programs.
}

int BaryonJUCEAudioProcessor::getCurrentProgram()
{
    return 0;
}

void BaryonJUCEAudioProcessor::setCurrentProgram (int index)
{
}

const juce::String BaryonJUCEAudioProcessor::getProgramName (int index)
{
    return {};
}

void BaryonJUCEAudioProcessor::changeProgramName (int index, const juce::String& newName)
{
}

//==============================================================================
void BaryonJUCEAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    lastSampleRate = sampleRate;
    checkForInputConnection();
}

void BaryonJUCEAudioProcessor::releaseResources()
{
    // When playback stops, you can use this as an opportunity to free up any
    // spare memory, etc.
}

#ifndef JucePlugin_PreferredChannelConfigurations
bool BaryonJUCEAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
  #if JucePlugin_IsMidiEffect
    juce::ignoreUnused (layouts);
    return true;
  #else
    // This is the place where you check if the layout is supported.
    // In this template code we only support mono or stereo.
    // Some plugin hosts, such as certain GarageBand versions, will only
    // load plugins that support stereo bus layouts.
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    // This checks if the input layout matches the output layout
   #if ! JucePlugin_IsSynth
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
   #endif

    return true;
  #endif
}
#endif

void BaryonJUCEAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    // Update playback state
    checkForInputConnection();

    // Clear any output channels that don't contain input data
    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    // Process the audio and perform FFT analysis
    for (int channel = 0; channel < totalNumInputChannels; ++channel)
    {
        auto* channelData = buffer.getWritePointer (channel);
        
        // Only analyze first channel for FFT
        if (channel == 0)
        {
            for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
            {
                pushNextSampleIntoFifo(channelData[sample]);
            }
            updateFFTData();
        }
    }
}

//==============================================================================
bool BaryonJUCEAudioProcessor::hasEditor() const
{
    return true; // (change this to false if you choose to not supply an editor)
}

juce::AudioProcessorEditor* BaryonJUCEAudioProcessor::createEditor()
{
    return new BaryonJUCEAudioProcessorEditor (*this);
}

//==============================================================================
void BaryonJUCEAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    // You should use this method to store your parameters in the memory block.
    // You could do that either as raw data, or use the XML or ValueTree classes
    // as intermediaries to make it easy to save and load complex data.
}

void BaryonJUCEAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    // You should use this method to restore your parameters from this memory block,
    // whose contents will have been created by the getStateInformation() call.
}

//==============================================================================
void BaryonJUCEAudioProcessor::pushNextSampleIntoFifo(float sample) noexcept
{
    if (fifoIndex == fftSize)
    {
        nextFFTBlockReady = true;
        fifoIndex = 0;
    }

    fifo[fifoIndex++] = sample;
}

void BaryonJUCEAudioProcessor::updateFFTData()
{
    if (nextFFTBlockReady)
    {
        // Apply windowing
        window.multiplyWithWindowingTable(fifo.data(), fftSize);

        // Copy data to FFT input
        std::fill(fftData.begin(), fftData.end(), 0.0f);
        std::copy(fifo.begin(), fifo.end(), fftData.begin());

        // Perform FFT
        fft.performFrequencyOnlyForwardTransform(fftData.data());

        // Calculate average amplitude
        float sum = 0.0f;
        for (int i = 0; i < fftSize/2; ++i)
        {
            sum += fftData[i];
        }
        averageAmplitude = sum / (fftSize/2);

        nextFFTBlockReady = false;
    }
}

//==============================================================================
// This creates new instances of the plugin..
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new BaryonJUCEAudioProcessor();
}
