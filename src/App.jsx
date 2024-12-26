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
const BASE_DELAY = 10000; // 10 seconds

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

  const generateImages = async () => {
    try {
      validateApiToken(apiToken);
      if (!excelFile || names.length === 0) {
        throw new Error('Please provide an Excel file with valid names');
      }

      setGenerating(true);
      setErrors([]);
      setGeneratedImages(
        names.reduce((acc, name) => ({
          ...acc,
          [name]: {}
        }), {})
      );
      
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
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <Button
            onClick={generateImages}
            disabled={generating || !apiToken || !excelFile}
            className="w-full"
          >
            {generating ? 'Generating Images...' : 'Generate Images'}
          </Button>

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

      {/* Modal for displaying selected image */}
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