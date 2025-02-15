/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin editor.

  ==============================================================================
*/

#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

//==============================================================================
/**
*/
class BaryonJUCEAudioProcessorEditor : public juce::AudioProcessorEditor,
                                      private juce::Timer
{
public:
    BaryonJUCEAudioProcessorEditor (BaryonJUCEAudioProcessor&);
    ~BaryonJUCEAudioProcessorEditor() override;

    //==============================================================================
    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void sendAudioDataToWebView();
    
    BaryonJUCEAudioProcessor& audioProcessor;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    
    static constexpr int updateInterval = 1000 / 60; // 60fps update rate

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BaryonJUCEAudioProcessorEditor)
};
