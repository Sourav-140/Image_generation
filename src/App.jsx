// App.jsx
import React, { useState } from 'react';
import { Download, AlertCircle, X } from 'lucide-react';
import * as xlsx from 'xlsx';
import { HfInference } from '@huggingface/inference';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Progress } from './components/ui/progress';
import Alert from './components/ui/alert';
import { MONTHS, SEASON_THEMES } from './constants/themes';
import { createPrompt } from './utils/promptGenerator';

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 60000; // 1 minute
const BASE_DELAY = 12000; // 12 seconds

export default function App() {
  const [apiToken, setApiToken] = useState('');
  const [excelFile, setExcelFile] = useState(null);
  const [names, setNames] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState('');
  const [generatedImages, setGeneratedImages] = useState({});
  const [errors, setErrors] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [generationType, setGenerationType] = useState('all');
  
  // New state structure for per-name month selection
  const [selectedNames, setSelectedNames] = useState([]);
  const [nameMonthSelections, setNameMonthSelections] = useState({});

  const handleExcelUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = xlsx.read(e.target.result, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = xlsx.utils.sheet_to_json(sheet);
          const extractedNames = data.map(row => row.Names).filter(Boolean);
          
          if (extractedNames.length === 0) {
            throw new Error('No valid names found in the Excel file');
          }
          
          setNames(extractedNames);
          setExcelFile(file);
          setErrors([]);
        } catch (err) {
          setErrors([`Excel file error: ${err.message || 'Invalid file format'}`]);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const generateImageWithRetry = async (client, name, month, retryCount = 0) => {
    try {
      const response = await client.textToImage({
        model: "black-forest-labs/FLUX.1-schnell",
        inputs: createPrompt(name, month, SEASON_THEMES[month]),
        parameters: {
          seed: (MONTHS.indexOf(month) + 1) * 1000,
          height: 1024,
          width: 1024
        }
      });

      return URL.createObjectURL(response);
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        const isRateLimit = error.message?.includes('rate limit') || error.status === 429;
        const delay = isRateLimit ? RATE_LIMIT_DELAY : BASE_DELAY * Math.pow(2, retryCount);
        
        setCurrentOperation(`Retry ${retryCount + 1}/${MAX_RETRIES} for ${name} - ${month} (waiting ${delay/1000}s)...`);
        await sleep(delay);
        
        return generateImageWithRetry(client, name, month, retryCount + 1);
      }
      
      throw error;
    }
  };

  const validateApiToken = (token) => {
    if (!token) throw new Error('API token is required');
    if (token.length < 8) throw new Error('Invalid API token format');
  };

  const handleNameSelection = (name) => {
    if (selectedNames.includes(name)) {
      setSelectedNames(selectedNames.filter(n => n !== name));
      // Remove the month selections for this name
      const { [name]: removed, ...rest } = nameMonthSelections;
      setNameMonthSelections(rest);
    } else {
      setSelectedNames([...selectedNames, name]);
      // Initialize empty month selection for this name
      setNameMonthSelections({
        ...nameMonthSelections,
        [name]: []
      });
    }
  };

  const handleMonthSelection = (name, month) => {
    setNameMonthSelections(prev => {
      const currentMonths = prev[name] || [];
      const updatedMonths = currentMonths.includes(month)
        ? currentMonths.filter(m => m !== month)
        : [...currentMonths, month];
      
      return {
        ...prev,
        [name]: updatedMonths
      };
    });
  };

  const generateImages = async () => {
    try {
      validateApiToken(apiToken);
      if (!excelFile || names.length === 0) {
        throw new Error('Please provide an Excel file with valid names');
      }

      setGenerating(true);
      setErrors([]);
      setGeneratedImages({});
      
      const client = new HfInference(apiToken);
      const totalOperations = names.length * MONTHS.length;
      let completed = 0;
      
      for (const name of names) {
        const failedMonths = [];
        
        for (const month of MONTHS) {
          setCurrentOperation(`Generating ${month} image for ${name}...`);
          
          try {
            const imageUrl = await generateImageWithRetry(client, name, month);
            setGeneratedImages(prev => ({
              ...prev,
              [name]: {
                ...prev[name],
                [month]: imageUrl
              }
            }));
            completed++;
            setProgress((completed / totalOperations) * 100);
          } catch (err) {
            failedMonths.push(month);
            setErrors(prev => [...prev, `Failed to generate ${month} image for ${name}: ${err.message}`]);
          }
          
          await sleep(BASE_DELAY);
        }
        
        if (failedMonths.length > 0) {
          setErrors(prev => [...prev, 
            `Skipped months for ${name}: ${failedMonths.join(', ')}`
          ]);
        }
      }
    } catch (err) {
      setErrors(prev => [...prev, `General error: ${err.message}`]);
    } finally {
      setGenerating(false);
      setCurrentOperation('');
    }
  };

  const generateCustomImages = async () => {
    try {
      validateApiToken(apiToken);
      
      // Check if any selections have been made
      const hasSelections = Object.values(nameMonthSelections).some(months => months.length > 0);
      if (!hasSelections) {
        throw new Error('Please select at least one name and month');
      }

      setGenerating(true);
      setErrors([]);
      
      const client = new HfInference(apiToken);
      
      // Calculate total operations based on individual selections
      const totalOperations = Object.entries(nameMonthSelections).reduce(
        (total, [_, months]) => total + months.length,
        0
      );
      
      let completed = 0;
      
      for (const name of selectedNames) {
        const selectedMonths = nameMonthSelections[name] || [];
        const failedMonths = [];
        
        for (const month of selectedMonths) {
          setCurrentOperation(`Generating ${month} image for ${name}...`);
          
          try {
            const imageUrl = await generateImageWithRetry(client, name, month);
            setGeneratedImages(prev => ({
              ...prev,
              [name]: {
                ...prev[name],
                [month]: imageUrl
              }
            }));
            completed++;
            setProgress((completed / totalOperations) * 100);
          } catch (err) {
            failedMonths.push(month);
            setErrors(prev => [...prev, `Failed to generate ${month} image for ${name}: ${err.message}`]);
          }
          
          await sleep(BASE_DELAY);
        }
        
        if (failedMonths.length > 0) {
          setErrors(prev => [...prev, 
            `Skipped months for ${name}: ${failedMonths.join(', ')}`
          ]);
        }
      }
    } catch (err) {
      setErrors(prev => [...prev, `General error: ${err.message}`]);
    } finally {
      setGenerating(false);
      setCurrentOperation('');
    }
  };

  const downloadImages = (name) => {
    const images = generatedImages[name];
    if (!images) return;

    Object.entries(images).forEach(([month, url]) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}_${month}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-6">AI Image Generator</h1>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hugging Face API Token
            </label>
            <Input
              type="password"
              placeholder="Enter your API token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Excel File
            </label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
            />
            {names.length > 0 && (
              <span className="mt-2 text-sm text-gray-500 block">
                {names.length} names loaded
              </span>
            )}
          </div>

          {errors.length > 0 && (
            <div className="space-y-2">
              {errors.map((error, index) => (
                <Alert key={index} variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <div>{error}</div>
                </Alert>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={generationType === 'all' ? "outline" : "ghost"}
                onClick={() => setGenerationType('all')}
                className={`flex-1 ${
                  generationType === 'all' 
                    ? "bg-blue-100 hover:bg-blue-200 border-blue-500 text-blue-700" 
                    : ""
                }`}
              >
                Generate All
              </Button>
              <Button
                variant={generationType === 'custom' ? "outline" : "ghost"}
                onClick={() => setGenerationType('custom')}
                className={`flex-1 ${
                  generationType === 'custom' 
                    ? "bg-blue-100 hover:bg-blue-200 border-blue-500 text-blue-700" 
                    : ""
                }`}
              >
                Custom Generation
              </Button>
            </div>

            {generationType === 'custom' ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  {names.map((name) => (
                    <div key={name} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Button
                          variant={selectedNames.includes(name) ? "outline" : "ghost"}
                          size="sm"
                          onClick={() => handleNameSelection(name)}
                          className={`text-sm ${
                            selectedNames.includes(name) 
                              ? "bg-blue-100 hover:bg-blue-200 border-blue-500 text-blue-700" 
                              : ""
                          }`}
                        >
                          {name}
                        </Button>
                        {selectedNames.includes(name) && (
                          <span className="text-sm text-gray-600">
                            {nameMonthSelections[name]?.length || 0} months selected
                          </span>
                        )}
                      </div>
                      
                      {selectedNames.includes(name) && (
                        <div className="flex flex-wrap gap-2 pl-4">
                          {MONTHS.map((month) => (
                            <Button
                              key={`${name}-${month}`}
                              variant={nameMonthSelections[name]?.includes(month) ? "outline" : "ghost"}
                              size="sm"
                              onClick={() => handleMonthSelection(name, month)}
                              className={`text-sm ${
                                nameMonthSelections[name]?.includes(month)
                                  ? "bg-green-100 hover:bg-green-200 border-green-500 text-green-700" 
                                  : ""
                              }`}
                            >
                              {month}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">
                      Total images to generate: {
                        Object.values(nameMonthSelections).reduce(
                          (total, months) => total + months.length,
                          0
                        )
                      }
                    </p>
                  </div>
                  <Button
                    onClick={generateCustomImages}
                    disabled={
                      generating || 
                      !apiToken || 
                      Object.values(nameMonthSelections).every(months => months.length === 0)
                    }
                  >
                    Generate Selected Images
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={generateImages}
                disabled={generating || !apiToken || !excelFile}
                className="w-full"
              >
                Generate All Images
              </Button>
            )}
          </div>

          {generating && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-gray-500 text-center">{currentOperation}</p>
            </div>
          )}
        </div>
      </div>

      {Object.entries(generatedImages).map(([name, months]) => (
        <div key={name} className="bg-white shadow-lg rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">{name}</h2>
            <Button
              variant="outline"
              onClick={() => downloadImages(name)}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download All
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(months).map(([month, imageUrl]) => (
              <div key={month} className="space-y-2">
                <div 
                  className="aspect-square relative overflow-hidden rounded-lg cursor-pointer transform transition-transform duration-300 hover:scale-105 hover:shadow-lg"
                  onClick={() => setSelectedImage({ url: imageUrl, name, month })}
                >
                  <img
                    src={imageUrl}
                    alt={`${name} - ${month}`}
                    className="object-cover w-full h-full"
                  />
                </div>
                <p className="text-sm font-medium text-center">{month}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="relative bg-white rounded-lg p-2 w-full max-w-[600px]"
            onClick={e => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              className="absolute top-2 right-2 z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="w-full max-h-[60vh] flex items-center justify-center">
              <img
                src={selectedImage.url}
                alt={`${selectedImage.name} - ${selectedImage.month}`}
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>
            <p className="text-center mt-2 font-medium">
              {selectedImage.name} - {selectedImage.month}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}