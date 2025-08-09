"""
DEHN Servus AI Summer Hackathon 2025 - Challenge 2 (Enhanced Version)
Enhanced Process to Building Kit Element Mapper

This enhanced algorithm includes:
1. Subprocess hierarchy support with "Verknüpfungen Prozessebene"
2. Word2Vec/Sentence encoder semantic similarity
3. Adaptive threshold matching (all good matches, not just top-k)
4. Improved domain knowledge integration
"""

import pandas as pd
import numpy as np
from difflib import SequenceMatcher
import re
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# Enhanced NLP imports
try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
    ADVANCED_NLP_AVAILABLE = True
    print("✅ Advanced NLP capabilities loaded (SentenceTransformers)")
except ImportError:
    ADVANCED_NLP_AVAILABLE = False
    print("ℹ️ Using enhanced similarity without embeddings (still very effective!)")

class EnhancedProcessBaukastenMapper:
    def __init__(self, excel_file_path):
        """
        Initialize the enhanced mapper with advanced NLP capabilities.
        
        Args:
            excel_file_path (str): Path to the Excel file with the data
        """
        self.excel_file_path = excel_file_path
        self.processes_df = None
        self.baukasten_df = None
        self.matrix_df = None
        self.subprocess_hierarchy = {}  # Maps main processes to subprocesses
        
        # Initialize sentence encoder if available
        if ADVANCED_NLP_AVAILABLE:
            try:
                print("🔄 Loading sentence transformer model...")
                self.sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
                print("✅ Sentence transformer loaded successfully")
                self.use_embeddings = True
            except Exception as e:
                print(f"⚠️ Could not load sentence transformer: {e}")
                self.use_embeddings = False
        else:
            self.use_embeddings = False
            print("📝 Enhanced algorithm with advanced similarity metrics (no embeddings)")
            
        self.load_data()
        
    def load_data(self):
        """Load and clean data from all sheets with subprocess hierarchy"""
        print("Loading data from Excel file...")
        
        # Load Lösungsbibliothek (Process Library)
        df_losung_raw = pd.read_excel(self.excel_file_path, sheet_name='Lösungsbibliothek', header=None)
        self.processes_df = df_losung_raw.iloc[1:].reset_index(drop=True)
        self.processes_df.columns = df_losung_raw.iloc[1].tolist()
        self.processes_df = self.processes_df.dropna(subset=['Prozessnummer']).reset_index(drop=True)
        
        # Clean process data - remove header row if it exists
        if self.processes_df.iloc[0]['Prozessnummer'] == 'Prozessnummer':
            self.processes_df = self.processes_df.iloc[1:].reset_index(drop=True)
        
        # Build subprocess hierarchy
        self._build_subprocess_hierarchy()
        
        # Load Baukasten (Building Kit)
        df_baukasten_raw = pd.read_excel(self.excel_file_path, sheet_name='Baukasten', header=None)
        self.baukasten_df = df_baukasten_raw.iloc[1:].reset_index(drop=True)
        self.baukasten_df.columns = df_baukasten_raw.iloc[1].tolist()
        self.baukasten_df = self.baukasten_df.dropna(subset=['Lfd. Nummer']).reset_index(drop=True)
        
        # Clean baukasten data - remove header row if it exists
        if str(self.baukasten_df.iloc[0]['Lfd. Nummer']) == 'Lfd. Nummer':
            self.baukasten_df = self.baukasten_df.iloc[1:].reset_index(drop=True)
        
        # Load Matrix
        self.matrix_df = pd.read_excel(self.excel_file_path, sheet_name='Bibliothek-Baukasten-Matrix', header=None)
        
        print(f"Loaded {len(self.processes_df)} processes and {len(self.baukasten_df)} building kit elements")
        print(f"Built subprocess hierarchy with {len(self.subprocess_hierarchy)} main processes")
        
    def _build_subprocess_hierarchy(self):
        """Build the subprocess hierarchy from Verknüpfungen Prozessebene column"""
        self.subprocess_hierarchy = {}
        
        for _, row in self.processes_df.iterrows():
            process_num = row['Prozessnummer']
            process_type = row.get('Prozessart', '')
            linkages = row.get('Verknüpfungen Prozessebene', '')
            
            if pd.notna(linkages) and process_type == 'Hauptprozess':
                # Parse subprocess range (e.g., "100001 - 100006")
                if '-' in str(linkages):
                    try:
                        start_str, end_str = str(linkages).split(' - ')
                        start_num = int(start_str.strip())
                        end_num = int(end_str.strip())
                        subprocess_list = list(range(start_num, end_num + 1))
                        self.subprocess_hierarchy[int(process_num)] = subprocess_list
                        print(f"Main process {process_num}: subprocesses {subprocess_list}")
                    except:
                        pass
                elif ',' in str(linkages):
                    # Handle comma-separated lists
                    try:
                        subprocess_list = [int(x.strip()) for x in str(linkages).split(',')]
                        self.subprocess_hierarchy[int(process_num)] = subprocess_list
                        print(f"Main process {process_num}: subprocesses {subprocess_list}")
                    except:
                        pass
    
    def get_process_embeddings(self, text_list):
        """Generate embeddings for text using sentence transformers"""
        if self.use_embeddings and text_list:
            try:
                embeddings = self.sentence_model.encode(text_list)
                return embeddings
            except Exception as e:
                print(f"⚠️ Error generating embeddings: {e}")
                return None
        return None
    
    def preprocess_text(self, text):
        """
        Preprocess text for similarity comparison
        
        Args:
            text (str): Input text
            
        Returns:
            str: Preprocessed text
        """
        if pd.isna(text) or text is None:
            return ""
        
        text = str(text).lower()
        # Remove special characters and extra spaces
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def extract_keywords(self, process_row):
        """
        Extract relevant keywords from a process row
        
        Args:
            process_row: DataFrame row containing process information
            
        Returns:
            list: List of keywords
        """
        keywords = []
        
        # Extract from process name
        process_name = self.preprocess_text(process_row.get('Prozessname', ''))
        if process_name:
            keywords.extend(process_name.split())
            
        # Extract from characteristic classes
        for i in range(1, 4):
            merkmal = self.preprocess_text(process_row.get(f'Merkmalsklasse {i}', ''))
            if merkmal and merkmal != '-':
                keywords.extend(merkmal.split())
        
        # Add process type information
        process_type = self.preprocess_text(process_row.get('Prozessart', ''))
        if process_type:
            keywords.append(process_type)
            
        # Add constraints/conditions
        for i in range(1, 3):
            randbedingung = self.preprocess_text(process_row.get(f'Randbedingung {i}', ''))
            if randbedingung and randbedingung != '-':
                keywords.extend(randbedingung.split())
            
        return list(set(keywords))  # Remove duplicates
    
    def calculate_embedding_similarity(self, process_text, baukasten_text):
        """
        Calculate semantic similarity using sentence embeddings
        
        Args:
            process_text (str): Combined process description
            baukasten_text (str): Combined building kit description
            
        Returns:
            float: Similarity score (0-1)
        """
        if not self.use_embeddings or not process_text or not baukasten_text:
            return 0.0
        
        try:
            texts = [process_text, baukasten_text]
            embeddings = self.get_process_embeddings(texts)
            
            if embeddings is not None and len(embeddings) == 2:
                similarity = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
                return max(0.0, similarity)  # Ensure non-negative
            
        except Exception as e:
            print(f"⚠️ Embedding similarity calculation failed: {e}")
        
        return 0.0
    
    def calculate_similarity(self, process_keywords, process_row, baukasten_row):
        """
        Enhanced similarity calculation with embeddings and adaptive scoring
        
        Args:
            process_keywords (list): Keywords from process
            process_row: DataFrame row with full process information
            baukasten_row: DataFrame row containing building kit element
            
        Returns:
            dict: Detailed similarity breakdown
        """
        # Extract building kit element information
        bauteil_name = self.preprocess_text(baukasten_row.get('Bauteilnamen', ''))
        kategorie = self.preprocess_text(baukasten_row.get('Bauteilkategorie', ''))
        hersteller = self.preprocess_text(baukasten_row.get('Hersteller', ''))
        typ = self.preprocess_text(baukasten_row.get('Typ', ''))
        kurzbeschreibung = self.preprocess_text(baukasten_row.get('Kurzbeschreibung', ''))
        
        # Combine all baukasten information
        baukasten_text = f"{bauteil_name} {kategorie} {hersteller} {typ} {kurzbeschreibung}".strip()
        baukasten_words = baukasten_text.split()
        
        # Combine process information for embedding similarity
        process_name = self.preprocess_text(process_row.get('Prozessname', ''))
        process_text = f"{process_name} {' '.join(process_keywords)}".strip()
        
        similarity_scores = {}
        
        # 1. Lexical Similarity (Direct keyword matching)
        keyword_matches = sum(1 for kw in process_keywords if kw in baukasten_text)
        similarity_scores['lexical'] = keyword_matches / len(process_keywords) if process_keywords else 0
        
        # 2. Fuzzy String Similarity
        fuzzy_scores = []
        for keyword in process_keywords:
            if keyword:
                component_scores = []
                for component in [bauteil_name, kategorie, typ, kurzbeschreibung]:
                    if component:
                        component_scores.append(SequenceMatcher(None, keyword, component).ratio())
                if component_scores:
                    fuzzy_scores.append(max(component_scores))
        
        similarity_scores['fuzzy'] = np.mean(fuzzy_scores) if fuzzy_scores else 0
        
        # 3. Semantic Embedding Similarity (NEW)
        similarity_scores['embedding'] = self.calculate_embedding_similarity(process_text, baukasten_text)
        
        # 4. Category-specific scoring
        similarity_scores['category'] = 0.5 if any(kw in kategorie for kw in process_keywords) else 0
        
        # 5. Enhanced Domain-specific scoring
        similarity_scores['domain'] = self.calculate_enhanced_domain_score(process_keywords, baukasten_row)
        
        # 6. Manufacturer/Type specific bonus
        similarity_scores['technical'] = self.calculate_technical_match_score(process_keywords, baukasten_row)
        
        # Weighted combination with adaptive weights
        weights = {
            'lexical': 1.0,
            'fuzzy': 0.8,
            'embedding': 1.2 if self.use_embeddings else 0.0,  # Higher weight for embeddings
            'category': 1.0,
            'domain': 1.5,  # Higher weight for domain knowledge
            'technical': 0.6
        }
        
        total_score = sum(weights[key] * similarity_scores[key] for key in similarity_scores)
        max_possible = sum(weights[key] for key in similarity_scores if key != 'embedding' or self.use_embeddings)
        
        final_score = total_score / max_possible if max_possible > 0 else 0
        
        # Store detailed breakdown for analysis
        similarity_scores['final'] = min(final_score, 1.0)
        
        return similarity_scores
    
    def calculate_enhanced_domain_score(self, process_keywords, baukasten_row):
        """
        Enhanced domain-specific similarity with expanded mappings
        
        Args:
            process_keywords (list): Keywords from process
            baukasten_row: DataFrame row containing building kit element
            
        Returns:
            float: Domain-specific score
        """
        score = 0
        kategorie = self.preprocess_text(baukasten_row.get('Bauteilkategorie', ''))
        bauteil_name = self.preprocess_text(baukasten_row.get('Bauteilnamen', ''))
        
        # Enhanced domain mappings
        enhanced_domain_mappings = {
            'drucken': {
                'categories': ['drucker', 'etiketten', 'kennzeichnung', 'topex', 'label'],
                'weight': 0.5
            },
            'applizieren': {
                'categories': ['roboter', 'greifer', 'werkzeug', 'applikator', 'anbringen'],
                'weight': 0.4
            },
            'greifen': {
                'categories': ['roboter', 'greifer', 'werkzeug', 'kuka', 'ur'],
                'weight': 0.4
            },
            'manipulieren': {
                'categories': ['roboter', 'greifer', 'manipulator'],
                'weight': 0.4
            },
            'erkennen': {
                'categories': ['kamera', 'sensor', 'vision', 'scanner', 'sensopart'],
                'weight': 0.4
            },
            'kontrollieren': {
                'categories': ['sensor', 'prüf', 'mess', 'kontrolle'],
                'weight': 0.3
            },
            'korrigieren': {
                'categories': ['roboter', 'aktor', 'steuerung'],
                'weight': 0.3
            },
            'bereitstellen': {
                'categories': ['transport', 'förder', 'magazin', 'bereitstellung'],
                'weight': 0.3
            },
            'zuführen': {
                'categories': ['transport', 'förder', 'zuführung', 'magazin'],
                'weight': 0.3
            },
            'prüfen': {
                'categories': ['sensor', 'prüf', 'mess', 'kamera', 'test'],
                'weight': 0.4
            },
            'palettieren': {
                'categories': ['roboter', 'transport', 'palettierer', 'kuka'],
                'weight': 0.4
            },
            'lesen': {
                'categories': ['kamera', 'scanner', 'sensor', 'code', 'barcode'],
                'weight': 0.3
            },
            'isolation': {
                'categories': ['prüf', 'isolations', 'mess', 'elektrisch'],
                'weight': 0.3
            }
        }
        
        # Check for enhanced domain matches
        for keyword in process_keywords:
            if keyword in enhanced_domain_mappings:
                mapping = enhanced_domain_mappings[keyword]
                for category_hint in mapping['categories']:
                    if category_hint in kategorie or category_hint in bauteil_name:
                        score += mapping['weight']
                        break
        
        # Special high-value matches
        if 'etikett' in process_keywords:
            if any(word in kategorie or word in bauteil_name 
                   for word in ['drucker', 'etikett', 'applikator', 'topex']):
                score += 0.6
                
        if any(robot_word in kategorie for robot_word in ['roboter']):
            if any(word in process_keywords 
                   for word in ['applizieren', 'greifen', 'manipulieren', 'palettieren', 'roboter']):
                score += 0.4
        
        return min(score, 1.0)  # Cap at 1.0
    
    def calculate_technical_match_score(self, process_keywords, baukasten_row):
        """
        Calculate technical matching score based on manufacturer and type information
        
        Args:
            process_keywords (list): Keywords from process
            baukasten_row: DataFrame row containing building kit element
            
        Returns:
            float: Technical match score
        """
        score = 0
        hersteller = self.preprocess_text(baukasten_row.get('Hersteller', ''))
        typ = self.preprocess_text(baukasten_row.get('Typ', ''))
        
        # Manufacturer-specific bonuses
        manufacturer_bonuses = {
            'kuka': ['roboter', 'greifen', 'applizieren', 'palettieren'],
            'topex': ['drucken', 'etikett', 'kennzeichnung'],
            'sensopart': ['erkennen', 'kamera', 'vision'],
            'ifm': ['sensor', 'abstand', 'näherung'],
            'siemens': ['steuerung', 'sps', 'automatisierung']
        }
        
        for manufacturer, related_keywords in manufacturer_bonuses.items():
            if manufacturer in hersteller:
                if any(kw in process_keywords for kw in related_keywords):
                    score += 0.3
                    break
        
        # Type-specific matches
        if any(kw in typ for kw in process_keywords):
            score += 0.2
            
        return min(score, 0.4)  # Cap technical score
    
    def get_adaptive_threshold(self, all_similarities):
        """
        Calculate adaptive threshold based on score distribution
        
        Args:
            all_similarities (list): List of similarity scores
            
        Returns:
            float: Adaptive threshold
        """
        if not all_similarities:
            return 0.1
        
        scores = [s for s in all_similarities if s > 0]
        if not scores:
            return 0.1
        
        # Use statistical approach for threshold
        mean_score = np.mean(scores)
        std_score = np.std(scores)
        max_score = max(scores)
        
        # Adaptive threshold: higher if we have good matches, lower otherwise
        if max_score > 0.7:
            threshold = max(0.2, mean_score - 0.5 * std_score)
        elif max_score > 0.4:
            threshold = max(0.15, mean_score - 0.3 * std_score)
        else:
            threshold = 0.1
        
        return min(threshold, 0.3)  # Cap at 0.3 to avoid being too restrictive
    
    def map_processes_to_baukasten_enhanced(self):
        """
        Enhanced mapping with subprocess support and adaptive thresholding
        
        Returns:
            dict: Enhanced mapping with subprocess information
        """
        print("🚀 Enhanced mapping with subprocess support and embeddings...")
        
        all_mappings = {}
        subprocess_mappings = {}
        
        for _, process_row in self.processes_df.iterrows():
            process_num = process_row['Prozessnummer']
            process_name = process_row['Prozessname']
            process_type = process_row.get('Prozessart', '')
            
            if pd.isna(process_num) or pd.isna(process_name):
                continue
                
            print(f"\n🔄 Processing: {process_num} - {process_name} ({process_type})")
            
            # Extract keywords from process
            keywords = self.extract_keywords(process_row)
            
            # Calculate similarity with all building kit elements
            similarities = []
            detailed_similarities = []
            
            for _, baukasten_row in self.baukasten_df.iterrows():
                lfd_nummer = baukasten_row['Lfd. Nummer']
                if pd.isna(lfd_nummer):
                    continue
                    
                similarity_breakdown = self.calculate_similarity(keywords, process_row, baukasten_row)
                final_score = similarity_breakdown['final']
                
                similarities.append(final_score)
                detailed_similarities.append({
                    'lfd_nummer': int(lfd_nummer),
                    'name': baukasten_row['Bauteilnamen'],
                    'score': final_score,
                    'breakdown': similarity_breakdown
                })
            
            # Calculate adaptive threshold
            adaptive_threshold = self.get_adaptive_threshold(similarities)
            print(f"   Adaptive threshold: {adaptive_threshold:.3f}")
            
            # Filter good matches using adaptive threshold
            good_matches = [
                match for match in detailed_similarities 
                if match['score'] >= adaptive_threshold
            ]
            
            # Sort by score
            good_matches.sort(key=lambda x: x['score'], reverse=True)
            
            # Store main process mappings
            main_process_baukasten = [match['lfd_nummer'] for match in good_matches]
            all_mappings[int(process_num)] = main_process_baukasten
            
            # Print results
            print(f"   Keywords: {keywords}")
            print(f"   Found {len(good_matches)} good matches:")
            for i, match in enumerate(good_matches[:5]):  # Show top 5
                embed_score = match['breakdown'].get('embedding', 0)
                domain_score = match['breakdown'].get('domain', 0)
                print(f"    {i+1}. {match['lfd_nummer']} - {match['name']}")
                print(f"       Score: {match['score']:.3f} (embed: {embed_score:.2f}, domain: {domain_score:.2f})")
            
            # Handle subprocess mappings for main processes
            if process_type == 'Hauptprozess' and int(process_num) in self.subprocess_hierarchy:
                subprocess_nums = self.subprocess_hierarchy[int(process_num)]
                print(f"   🔗 Processing subprocesses: {subprocess_nums}")
                
                # Collect building kit elements from all subprocesses
                combined_subprocess_baukasten = set(main_process_baukasten)  # Start with main process
                
                for subprocess_num in subprocess_nums:
                    subprocess_row = self.processes_df[
                        self.processes_df['Prozessnummer'] == subprocess_num
                    ]
                    
                    if not subprocess_row.empty:
                        subprocess_name = subprocess_row.iloc[0]['Prozessname']
                        subprocess_keywords = self.extract_keywords(subprocess_row.iloc[0])
                        
                        print(f"     └─ Subprocess {subprocess_num}: {subprocess_name}")
                        
                        # Calculate similarities for subprocess
                        subprocess_similarities = []
                        subprocess_detailed = []
                        
                        for _, baukasten_row in self.baukasten_df.iterrows():
                            lfd_nummer = baukasten_row['Lfd. Nummer']
                            if pd.isna(lfd_nummer):
                                continue
                                
                            similarity_breakdown = self.calculate_similarity(
                                subprocess_keywords, subprocess_row.iloc[0], baukasten_row
                            )
                            final_score = similarity_breakdown['final']
                            
                            subprocess_similarities.append(final_score)
                            subprocess_detailed.append({
                                'lfd_nummer': int(lfd_nummer),
                                'name': baukasten_row['Bauteilnamen'],
                                'score': final_score
                            })
                        
                        # Get good matches for subprocess
                        subprocess_threshold = self.get_adaptive_threshold(subprocess_similarities)
                        subprocess_good = [
                            match for match in subprocess_detailed 
                            if match['score'] >= subprocess_threshold
                        ]
                        subprocess_good.sort(key=lambda x: x['score'], reverse=True)
                        
                        # Add to combined set
                        subprocess_baukasten = [match['lfd_nummer'] for match in subprocess_good]
                        combined_subprocess_baukasten.update(subprocess_baukasten)
                        
                        # Store individual subprocess mapping
                        all_mappings[int(subprocess_num)] = subprocess_baukasten
                        
                        print(f"        Found {len(subprocess_good)} matches for subprocess")
                
                # Update main process with combined baukasten elements
                all_mappings[int(process_num)] = list(combined_subprocess_baukasten)
                print(f"   📦 Combined baukasten elements: {len(combined_subprocess_baukasten)}")
        
        return all_mappings
    
    def create_enhanced_filled_matrix(self, mappings):
        """
        Create enhanced filled matrix with more comprehensive coverage
        
        Args:
            mappings (dict): Process to building kit mappings
            
        Returns:
            pd.DataFrame: Enhanced filled matrix
        """
        print("📊 Creating enhanced filled matrix...")
        
        # Create a copy of the original matrix structure
        filled_matrix = self.matrix_df.copy()
        
        # Get process columns (skip first column which is row labels)
        process_columns = filled_matrix.columns[1:]
        
        # Get process numbers from row 1 (0-indexed)
        process_numbers = [int(x) if not pd.isna(x) else None for x in filled_matrix.iloc[1, 1:]]
        
        # Find the building kit elements rows (starting from row 2)
        baukasten_start_row = 2
        
        # Fill the matrix with enhanced mappings
        for col_idx, process_num in enumerate(process_numbers):
            if process_num and process_num in mappings:
                baukasten_elements = mappings[process_num]
                
                # Fill the column with the mapped building kit elements
                for row_idx, element in enumerate(baukasten_elements):
                    matrix_row = baukasten_start_row + 1 + row_idx  # +1 to skip header row
                    if matrix_row < len(filled_matrix):
                        filled_matrix.iloc[matrix_row, col_idx + 1] = element
                    else:
                        # Add more rows if needed
                        new_row = [row_idx + 1] + [None] * len(process_numbers)
                        new_row[col_idx + 1] = element
                        filled_matrix = pd.concat([
                            filled_matrix, 
                            pd.DataFrame([new_row], columns=filled_matrix.columns)
                        ], ignore_index=True)
        
        return filled_matrix
    
    def save_enhanced_results(self, mappings, output_file_path):
        """
        Save enhanced results with detailed analysis
        
        Args:
            mappings (dict): Process to building kit mappings
            output_file_path (str): Path for the output Excel file
        """
        print(f"💾 Saving enhanced results to {output_file_path}...")
        
        # Create enhanced filled matrix
        filled_matrix = self.create_enhanced_filled_matrix(mappings)
        
        # Create Excel writer
        with pd.ExcelWriter(output_file_path, engine='openpyxl') as writer:
            # Save original sheets
            self.processes_df.to_excel(writer, sheet_name='Lösungsbibliothek', index=False)
            self.baukasten_df.to_excel(writer, sheet_name='Baukasten', index=False)
            
            # Save original matrix structure for reference
            pd.DataFrame(self.matrix_df.values).to_excel(
                writer, sheet_name='Original-Matrix', index=False, header=False
            )
            
            # Save enhanced filled matrix
            pd.DataFrame(filled_matrix.values).to_excel(
                writer, sheet_name='Enhanced-Filled-Matrix', index=False, header=False
            )
            
            # Create enhanced summary sheet
            enhanced_summary_data = []
            subprocess_summary_data = []
            
            for process_num, baukasten_list in mappings.items():
                process_row = self.processes_df[
                    self.processes_df['Prozessnummer'] == process_num
                ]
                
                if not process_row.empty:
                    process_name = process_row.iloc[0]['Prozessname']
                    process_type = process_row.iloc[0].get('Prozessart', '')
                    
                    # Check if this is a main process with subprocesses
                    is_main_with_subs = (process_type == 'Hauptprozess' and 
                                        int(process_num) in self.subprocess_hierarchy)
                    
                    for rank, baukasten_num in enumerate(baukasten_list, 1):
                        baukasten_row = self.baukasten_df[
                            self.baukasten_df['Lfd. Nummer'] == baukasten_num
                        ]
                        
                        if not baukasten_row.empty:
                            baukasten_name = baukasten_row.iloc[0]['Bauteilnamen']
                            baukasten_category = baukasten_row.iloc[0].get('Bauteilkategorie', '')
                            
                            summary_entry = {
                                'Prozessnummer': process_num,
                                'Prozessname': process_name,
                                'Prozessart': process_type,
                                'Rank': rank,
                                'Baukasten_Lfd_Nummer': baukasten_num,
                                'Bauteilname': baukasten_name,
                                'Bauteilkategorie': baukasten_category,
                                'Has_Subprocesses': is_main_with_subs,
                                'Total_Matches': len(baukasten_list)
                            }
                            
                            if process_type == 'Hauptprozess':
                                enhanced_summary_data.append(summary_entry)
                            else:
                                subprocess_summary_data.append(summary_entry)
            
            # Save enhanced summary
            pd.DataFrame(enhanced_summary_data).to_excel(
                writer, sheet_name='Main-Process-Mappings', index=False
            )
            
            # Save subprocess summary
            if subprocess_summary_data:
                pd.DataFrame(subprocess_summary_data).to_excel(
                    writer, sheet_name='Subprocess-Mappings', index=False
                )
            
            # Save subprocess hierarchy information
            hierarchy_data = []
            for main_process, subprocesses in self.subprocess_hierarchy.items():
                main_name = self.processes_df[
                    self.processes_df['Prozessnummer'] == main_process
                ]['Prozessname'].iloc[0] if len(self.processes_df[
                    self.processes_df['Prozessnummer'] == main_process
                ]) > 0 else "Unknown"
                
                for subprocess in subprocesses:
                    sub_name = self.processes_df[
                        self.processes_df['Prozessnummer'] == subprocess
                    ]['Prozessname'].iloc[0] if len(self.processes_df[
                        self.processes_df['Prozessnummer'] == subprocess
                    ]) > 0 else "Unknown"
                    
                    hierarchy_data.append({
                        'Main_Process_Num': main_process,
                        'Main_Process_Name': main_name,
                        'Subprocess_Num': subprocess,
                        'Subprocess_Name': sub_name
                    })
            
            if hierarchy_data:
                pd.DataFrame(hierarchy_data).to_excel(
                    writer, sheet_name='Process-Hierarchy', index=False
                )
        
        print("✅ Enhanced results saved successfully!")

def main():
    """Main function to run the enhanced mapping algorithm"""
    
    print("🚀 DEHN Enhanced Process-Baukasten Mapper v2.0")
    print("=" * 60)
    
    # Initialize the enhanced mapper
    mapper = EnhancedProcessBaukastenMapper('Challenge 2_Bibliothek und Baukasten.xlsx')
    
    # Perform enhanced mapping
    mappings = mapper.map_processes_to_baukasten_enhanced()
    
    # Save enhanced results
    mapper.save_enhanced_results(mappings, 'Enhanced_Challenge_2_Results.xlsx')
    
    print("\n" + "=" * 60)
    print("🎉 ENHANCED MAPPING COMPLETED!")
    print("=" * 60)
    
    # Summary statistics
    total_processes = len(mappings)
    total_mappings = sum(len(v) for v in mappings.values())
    avg_matches = total_mappings / total_processes if total_processes > 0 else 0
    
    main_processes = sum(1 for num in mappings.keys() 
                        if num in mapper.subprocess_hierarchy)
    
    print(f"📊 Summary Statistics:")
    print(f"   Total Processes Mapped: {total_processes}")
    print(f"   Total Baukasten Mappings: {total_mappings}")
    print(f"   Average Matches per Process: {avg_matches:.1f}")
    print(f"   Main Processes with Subprocesses: {main_processes}")
    print(f"   Subprocess Hierarchies: {len(mapper.subprocess_hierarchy)}")
    
    if mapper.use_embeddings:
        print(f"   ✅ Used Advanced NLP (Sentence Embeddings)")
    else:
        print(f"   ⚠️ Basic NLP only (no embeddings)")
    
    print(f"\n📁 Results saved to: 'Enhanced_Challenge_2_Results.xlsx'")
    print("   └─ Enhanced-Filled-Matrix sheet contains the main deliverable")
    print("   └─ Additional analysis sheets for validation")
    
    return mappings

if __name__ == "__main__":
    main()
