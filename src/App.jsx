// App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Download, AlertCircle, X, Loader2, StopCircle, RotateCcw, Sun, Moon } from 'lucide-react';
import * as xlsx from 'xlsx';
import { HfInference } from '@huggingface/inference';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import Alert from './components/ui/alert';
import { MONTHS, SEASON_THEMES } from './constants/themes';
import { createPrompt } from './utils/promptGenerator';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 60000; // 1 minute
const BASE_DELAY = 12000; // 12 seconds

const ImageTile = ({ imageUrl, isGenerating, name, month, onClick, show }) => {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className="space-y-2"
    >
      <div 
        className="aspect-square relative overflow-hidden rounded-xl cursor-pointer shadow-md hover:shadow-xl transition-all duration-300"
        onClick={() => !isGenerating && onClick()}
      >
        {isGenerating ? (
          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">Generating {month} for {name}...</p>
          </div>
        ) : (
          imageUrl ? (
            <img
              src={imageUrl}
              alt={`${name} - ${month}`}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">Waiting to generate...</p>
            </div>
          )
        )}
      </div>
      <p className="text-sm font-medium text-center text-slate-700 dark:text-slate-300">{month}</p>
    </motion.div>
  );
};

export default function App() {
  const [apiToken, setApiToken] = useState('');
  const [excelFile, setExcelFile] = useState(null);
  const [names, setNames] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [currentOperation, setCurrentOperation] = useState('');
  const [generatedImages, setGeneratedImages] = useState({});
  const [generatingStates, setGeneratingStates] = useState({});
  const [errors, setErrors] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [generationType, setGenerationType] = useState('all');
  const [selectedNames, setSelectedNames] = useState([]);
  const [nameMonthSelections, setNameMonthSelections] = useState({});
  const [visibleTiles, setVisibleTiles] = useState({});
  const [isDarkMode, setIsDarkMode] = useState(true);
  const stopGenerationRef = useRef(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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
      const { [name]: removed, ...rest } = nameMonthSelections;
      setNameMonthSelections(rest);
    } else {
      setSelectedNames([...selectedNames, name]);
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

  const resetMonthSelection = (name) => {
    setNameMonthSelections(prev => {
      const { [name]: removed, ...rest } = prev;
      return {
        ...rest,
        [name]: []
      };
    });
  };

  const stopGeneration = () => {
    stopGenerationRef.current = true;
    setCurrentOperation('Stopping generation...');
  };

  const generateImages = async () => {
    try {
      validateApiToken(apiToken);
      if (!excelFile || names.length === 0) {
        throw new Error('Please provide an Excel file with valid names');
      }
  
      setGenerating(true);
      setErrors([]);
      stopGenerationRef.current = false;
      
      const initialStates = {};
      const initialVisibility = {};
      names.forEach(name => {
        initialStates[name] = {};
        initialVisibility[name] = {};
        MONTHS.forEach(month => {
          initialStates[name][month] = false;
          initialVisibility[name][month] = false;
        });
      });
      setGeneratingStates(initialStates);
      setVisibleTiles(initialVisibility);
      
      const initialImages = {};
      names.forEach(name => {
        initialImages[name] = {};
      });
      setGeneratedImages(initialImages);
      
      const client = new HfInference(apiToken);
      
      for (const name of names) {
        if (stopGenerationRef.current) {
          throw new Error('Generation stopped by user');
        }

        const failedMonths = [];
        
        for (const month of MONTHS) {
          if (stopGenerationRef.current) {
            throw new Error('Generation stopped by user');
          }

          setVisibleTiles(prev => ({
            ...prev,
            [name]: { ...prev[name], [month]: true }
          }));
          
          setCurrentOperation(`Generating ${month} image for ${name}...`);
          setGeneratingStates(prev => ({
            ...prev,
            [name]: { ...prev[name], [month]: true }
          }));
          
          try {
            const imageUrl = await generateImageWithRetry(client, name, month);
            setGeneratedImages(prev => ({
              ...prev,
              [name]: {
                ...prev[name],
                [month]: imageUrl
              }
            }));
          } catch (err) {
            failedMonths.push(month);
            setErrors(prev => [...prev, `Failed to generate ${month} image for ${name}: ${err.message}`]);
          } finally {
            setGeneratingStates(prev => ({
              ...prev,
              [name]: { ...prev[name], [month]: false }
            }));
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
      stopGenerationRef.current = false;
    }
  };

  const generateCustomImages = async () => {
    try {
      validateApiToken(apiToken);
      
      const hasSelections = Object.values(nameMonthSelections).some(months => months.length > 0);
      if (!hasSelections) {
        throw new Error('Please select at least one name and month');
      }
  
      setGenerating(true);
      setErrors([]);
      stopGenerationRef.current = false;
      
      const initialStates = {};
      const initialVisibility = {};
      selectedNames.forEach(name => {
        initialStates[name] = {};
        initialVisibility[name] = {};
        nameMonthSelections[name].forEach(month => {
          initialStates[name][month] = false;
          initialVisibility[name][month] = false;
        });
      });
      setGeneratingStates(initialStates);
      setVisibleTiles(initialVisibility);
      
      const initialImages = {};
      selectedNames.forEach(name => {
        initialImages[name] = {};
      });
      setGeneratedImages(prev => ({
        ...prev,
        ...initialImages
      }));
      
      const client = new HfInference(apiToken);
      
      for (const name of selectedNames) {
        if (stopGenerationRef.current) {
          throw new Error('Generation stopped by user');
        }

        const selectedMonths = nameMonthSelections[name] || [];
        const failedMonths = [];
        
        for (const month of selectedMonths) {
          if (stopGenerationRef.current) {
            throw new Error('Generation stopped by user');
          }

          setVisibleTiles(prev => ({
            ...prev,
            [name]: { ...prev[name], [month]: true }
          }));
          
          setCurrentOperation(`Generating ${month} image for ${name}...`);
          setGeneratingStates(prev => ({
            ...prev,
            [name]: { ...prev[name], [month]: true }
          }));
          
          try {
            const imageUrl = await generateImageWithRetry(client, name, month);
            setGeneratedImages(prev => ({
              ...prev,
              [name]: {
                ...prev[name],
                [month]: imageUrl
              }
            }));
          } catch (err) {
            failedMonths.push(month);
            setErrors(prev => [...prev, `Failed to generate ${month} image for ${name}: ${err.message}`]);
          } finally {
            setGeneratingStates(prev => ({
              ...prev,
              [name]: { ...prev[name], [month]: false }
            }));
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
      stopGenerationRef.current = false;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black dark:to-black-900 py-8">

      {/* Dark Mode Toggle */}
      <div className="absolute top-2 right-4 z-50">
      <Button
        variant="none"
        size="icon"
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="rounded-full items-center w-10 h-10 bg-white dark:bg-black hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors duration-200"
      >
        {isDarkMode ? (
          <Sun className="h-4 w-3 text-slate-100" />
        ) : (
          <Moon className="h-4 w-3 text-slate-700" />
        )}
      </Button>
    </div>

      <div className="container mx-auto p-6 max-w-5xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm shadow-xl rounded-2xl p-8 mb-8 border border-slate-200 dark:border-gray-700"
        >
          <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AI Image Generator
          </h1>
          
          <div className="space-y-8">
          <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Hugging Face API Token
              </label>
              <Input
                type="password"
                placeholder="Enter your API token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-blue-500 hover:border-blue-400 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Excel File
              </label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                className="transition-all duration-200 file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-gradient-to-r from-[#2c3e95]/90 to-[#3fa88e]/80   file:text-white file:rounded-lg hover:file:bg-blue-600 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
              <AnimatePresence>
                {names.length > 0 && (
                  <motion.span
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-2 text-sm text-slate-500 dark:text-slate-400 block"
                  >
                    {names.length} names loaded
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {errors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  {errors.map((error, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <div>{error}</div>
                      </Alert>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="space-y-6"
            >
              <div className="flex gap-4 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
                <Button
                  variant={generationType === 'all' ? "outline" : "ghost"}
                  onClick={() => setGenerationType('all')}
                  className={`flex-1 transition-all duration-300 ${
                    generationType === 'all' 
                      ? "bg-white dark:bg-slate-800 shadow-md hover:shadow-lg hover:scale-[1.02]" 
                      : "hover:bg-white/50 dark:hover:bg-slate-600"
                  }`}
                >
                  Generate All
                </Button>
                <Button
                  variant={generationType === 'custom' ? "outline" : "ghost"}
                  onClick={() => setGenerationType('custom')}
                  className={`flex-1 transition-all duration-300 ${
                    generationType === 'custom' 
                      ? "bg-white dark:bg-slate-800 shadow-md hover:shadow-lg hover:scale-[1.02]" 
                      : "hover:bg-white/50 dark:hover:bg-slate-600"
                  }`}
                >
                  Custom Generation
                </Button>
              </div>

              <AnimatePresence mode="wait">
                {generationType === 'custom' ? (
                  <motion.div
                    key="custom"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      {names.map((name, index) => (
                        <motion.div
                          key={name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2 hover:shadow-md transition-all duration-300 dark:bg-slate-800/50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                variant={selectedNames.includes(name) ? "outline" : "ghost"}
                                size="sm"
                                onClick={() => handleNameSelection(name)}
                                className={`text-sm transition-all duration-300 ${
                                  selectedNames.includes(name) 
                                    ? "bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                                    : ""
                                }`}
                              >
                                {name}
                              </Button>
                              {selectedNames.includes(name) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetMonthSelection(name)}
                                  className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <AnimatePresence>
                              {selectedNames.includes(name) && (
                                <motion.span
                                  initial={{ opacity: 0, x: 20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 20 }}
                                  className="text-sm text-slate-600 dark:text-slate-400"
                                >
                                  {nameMonthSelections[name]?.length || 0} months selected
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          
                          <AnimatePresence>
                            {selectedNames.includes(name) && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex flex-wrap gap-2 pl-4"
                              >
                                {MONTHS.map((month, monthIndex) => (
                                  <motion.div
                                    key={`${name}-${month}`}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: monthIndex * 0.05 }}
                                  >
                                    <Button
                                      variant={nameMonthSelections[name]?.includes(month) ? "outline" : "ghost"}
                                      size="sm"
                                      onClick={() => handleMonthSelection(name, month)}
                                      className={`text-sm transition-all duration-300 ${
                                        nameMonthSelections[name]?.includes(month)
                                          ? "bg-green-50 dark:bg-green-900/50 hover:bg-green-100 dark:hover:bg-green-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 transform hover:scale-105" 
                                          : "hover:bg-slate-100 dark:hover:bg-slate-700"
                                      }`}
                                    >
                                      {month}
                                    </Button>
                                  </motion.div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Total images to generate: {
                            Object.values(nameMonthSelections).reduce(
                              (total, months) => total + months.length,
                              0
                            )
                          }
                        </p>
                      </div>
                      {!generating ? (
                        <Button
                          onClick={generateCustomImages}
                          disabled={
                            generating || 
                            !apiToken || 
                            Object.values(nameMonthSelections).every(months => months.length === 0)
                          }
                          className="bg-blue-500 hover:bg-blue-600 transition-all duration-300 transform hover:scale-105"
                        >
                          Generate Selected Images
                        </Button>
                      ) : (
                        <Button
                          onClick={stopGeneration}
                          variant="destructive"
                          className="bg-red-500 hover:bg-red-600 text-white transition-all duration-300 transform hover:scale-105"
                        >
                          <StopCircle className="h-4 w-4 mr-2" />
                          Stop Generation
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="all"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    {!generating ? (
                      <Button
                        onClick={generateImages}
                        disabled={generating || !apiToken || !excelFile}
                        className="w-full bg-blue-500 hover:bg-blue-600 transition-all duration-300 transform hover:scale-105"
                      >
                        Generate All Images
                      </Button>
                    ) : (
                      <Button
                        onClick={stopGeneration}
                        variant="destructive"
                        className="w-full bg-red-500 hover:bg-red-600 transition-all text-white duration-300 transform hover:scale-105"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stop Generation
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>

        <motion.div layout className="space-y-8">
          {Object.entries(generatedImages).map(([name, months], index) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2 }}
              className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm shadow-xl rounded-2xl p-8 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{name}</h2>
                <Button
                  variant="outline"
                  onClick={() => downloadImages(name)}
                  className="flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition-all duration-300"
                >
                  <Download className="h-4 w-4" />
                  Download All
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MONTHS.map((month) => (
                  <ImageTile
                    key={month}
                    imageUrl={generatedImages[name]?.[month]}
                    isGenerating={generatingStates[name]?.[month]}
                    name={name}
                    month={month}
                    show={visibleTiles[name]?.[month]}
                    onClick={() => {
                      if (generatedImages[name]?.[month]) {
                        setSelectedImage({ 
                          url: generatedImages[name][month], 
                          name, 
                          month 
                        });
                      }
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white dark:bg-slate-800 rounded-2xl p-4 w-full max-w-[600px] shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2 z-10 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-h-[60vh] flex items-center justify-center"
                >
                  <img
                    src={selectedImage.url}
                    alt={`${selectedImage.name} - ${selectedImage.month}`}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                  />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center mt-4 font-medium text-slate-700"
                >
                  {selectedImage.name} - {selectedImage.month}
                </motion.p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

//-------------------------------------------------------------------------------------------------------------------

//App.jsx with dark mode enabled

