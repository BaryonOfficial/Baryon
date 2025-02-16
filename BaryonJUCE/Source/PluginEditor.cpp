/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin editor.

  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "BinaryResources.h"

//==============================================================================
BaryonJUCEAudioProcessorEditor::BaryonJUCEAudioProcessorEditor (BaryonJUCEAudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{
    // Create and set up WebView with proper options
    juce::WebBrowserComponent::Options options = juce::WebBrowserComponent::Options()
        .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options(juce::WebBrowserComponent::Options::WinWebView2()
            .withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory)))
        .withNativeIntegrationEnabled(true)
        .withResourceProvider([](const juce::String& url) -> std::unique_ptr<juce::InputStream>
        {
            // Remove the juce://juce.backend/ prefix
            juce::String path = url.fromFirstOccurrenceOf("juce://juce.backend/", false, false);
            
            // Get the binary resource for this path
            const char* resourcePtr = nullptr;
            int resourceSize = 0;
            
            if (path == "index.html")
            {
                resourcePtr = WebResources::index_html;
                resourceSize = WebResources::index_htmlSize;
            }
            // Add other resources as needed
            
            if (resourcePtr != nullptr)
                return std::make_unique<juce::MemoryInputStream>(resourcePtr, resourceSize, false);
                
            return nullptr;
        });

    webView = std::make_unique<juce::WebBrowserComponent>(options);
    addAndMakeVisible(webView.get());
    
    // Load the React app
    #if JUCE_DEBUG
    webView->goToURL("http://localhost:5173"); // Development server
    #else
    webView->goToURL("juce://juce.backend/index.html");
    #endif
    
    // Start timer for regular updates
    startTimerHz(60);
    
    // Set editor size
    setSize (800, 600);
}

BaryonJUCEAudioProcessorEditor::~BaryonJUCEAudioProcessorEditor()
{
    stopTimer();
}

//==============================================================================
void BaryonJUCEAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll(juce::Colours::black);
}

void BaryonJUCEAudioProcessorEditor::resized()
{
    // Make WebView fill the entire window
    webView->setBounds(getLocalBounds());
}

void BaryonJUCEAudioProcessorEditor::timerCallback()
{
    sendAudioDataToWebView();
}

void BaryonJUCEAudioProcessorEditor::sendAudioDataToWebView()
{
    // Create JSON object with audio data
    juce::String jsonData = juce::String::formatted(R"({
        "fftData": [%s],
        "averageAmplitude": %f,
        "sampleRate": %f,
        "isPlaying": %s,
        "isInputConnected": %s
    })",
        // Convert FFT data array to string
        [&]() {
            juce::String fftString;
            const float* fftData = audioProcessor.getFFTData();
            const int fftSize = audioProcessor.getFFTSize();
            
            for (int i = 0; i < fftSize/2; ++i)
            {
                fftString += juce::String(fftData[i]);
                if (i < fftSize/2 - 1)
                    fftString += ",";
            }
            return fftString;
        }(),
        audioProcessor.getAverageAmplitude(),
        audioProcessor.getCurrentSampleRate(),
        audioProcessor.isPlaying() ? "true" : "false",
        audioProcessor.isInputConnected() ? "true" : "false"
    );
    
    // Send data to WebView
    webView->evaluateJavaScript("window.audioDataCallback(" + jsonData + ");");
}
